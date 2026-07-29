-- ============================================================
-- LESIONES E ÍTEMS CONSUMIBLES (estilo FIFA)
--
-- 1. Los jugadores se lesionan durante los partidos. La lesión dura
--    1, 2 o 3 partidos y tiene un tipo (hombro, tobillo, rodilla...).
-- 2. Se curan con ítems: los específicos son baratos y curan una
--    lesión leve; los generales son caros y curan cualquier cosa.
-- 3. Ítems de energía: +10, +20 o +30 de estamina, cada vez más caros
--    por punto recuperado.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Lesiones por partidos (no por tiempo)
-- ------------------------------------------------------------
alter table public.player_cards
  add column if not exists injury_type          text,
  add column if not exists injury_matches_left  int not null default 0;

create index if not exists idx_cards_injured
  on public.player_cards (owner_id) where injury_matches_left > 0;

-- Catálogo de lesiones. `severity` = partidos de baja.
create table if not exists public.injury_types (
  code       text primary key,
  name       text not null,
  severity   int  not null,          -- 1, 2 o 3 partidos
  weight     numeric not null,       -- probabilidad relativa
  body_part  text not null
);
alter table public.injury_types enable row level security;
drop policy if exists "injury_types_read" on public.injury_types;
create policy "injury_types_read" on public.injury_types for select using (true);

insert into public.injury_types (code, name, severity, weight, body_part) values
  ('knock_shoulder', 'Golpe en el hombro',   1, 22, 'hombro'),
  ('knock_ankle',    'Tobillo resentido',    1, 24, 'tobillo'),
  ('bruise_thigh',   'Golpe en el muslo',    1, 20, 'muslo'),
  ('strain_calf',    'Sobrecarga de gemelo', 2, 14, 'gemelo'),
  ('strain_groin',   'Molestia en el aductor', 2, 10, 'aductor'),
  ('sprain_ankle',   'Esguince de tobillo',  2,  6, 'tobillo'),
  ('hamstring',      'Desgarro isquiotibial',3,  3, 'isquiotibial'),
  ('knee',           'Lesión de rodilla',    3,  1, 'rodilla')
on conflict (code) do update
  set name = excluded.name, severity = excluded.severity,
      weight = excluded.weight, body_part = excluded.body_part;

-- ------------------------------------------------------------
-- 2) Ítems consumibles
-- ------------------------------------------------------------
create table if not exists public.items (
  code        text primary key,
  name        text not null,
  description text,
  kind        text not null,        -- 'heal' | 'stamina'
  power       int  not null,        -- heal: severidad máxima curable; stamina: puntos
  price_coins bigint not null,
  rarity      text not null default 'common',
  sort        int not null default 0,
  active      boolean not null default true
);
alter table public.items enable row level security;
drop policy if exists "items_read" on public.items;
create policy "items_read" on public.items for select using (active);

insert into public.items (code, name, description, kind, power, price_coins, rarity, sort) values
  -- Curación: cuanto más grave cura, más caro
  ('heal_1', 'Vendaje',            'Cura una lesión leve (1 partido).',              'heal', 1,   600, 'common',    10),
  ('heal_2', 'Fisioterapia',       'Cura lesiones de hasta 2 partidos.',             'heal', 2,  1800, 'uncommon',  20),
  ('heal_3', 'Tratamiento total',  'Cura cualquier lesión, hasta 3 partidos.',       'heal', 3,  5000, 'rare',      30),
  -- Energía: cuanto más recupera, más caro por punto
  ('stam_10','Bebida isotónica',   'Recupera 10 de energía.',                        'stamina', 10,  250, 'common',   40),
  ('stam_20','Recuperación',       'Recupera 20 de energía.',                        'stamina', 20,  700, 'uncommon', 50),
  ('stam_30','Cámara hiperbárica', 'Recupera 30 de energía.',                        'stamina', 30, 1600, 'rare',     60)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      kind = excluded.kind, power = excluded.power,
      price_coins = excluded.price_coins, rarity = excluded.rarity,
      sort = excluded.sort;

-- Inventario del usuario
create table if not exists public.user_items (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  item_code text not null references public.items(code),
  qty       int  not null default 0 check (qty >= 0),
  primary key (user_id, item_code)
);
alter table public.user_items enable row level security;
drop policy if exists "user_items_own" on public.user_items;
create policy "user_items_own" on public.user_items
  for select using (auth.uid() = user_id);
-- La escritura solo por RPC.

-- ------------------------------------------------------------
-- 3) RPC: comprar ítem
-- ------------------------------------------------------------
create or replace function public.buy_item(p_code text, p_qty int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_item record; v_cost bigint; v_coins bigint; v_qty int := greatest(1, least(20, p_qty));
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_item from public.items where code = p_code and active;
  if not found then raise exception 'item not available'; end if;

  v_cost := v_item.price_coins * v_qty;
  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_cost then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_cost where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_cost, 'item_buy', p_code, v_coins - v_cost);

  insert into public.user_items(user_id, item_code, qty)
    values (v_user, p_code, v_qty)
    on conflict (user_id, item_code) do update set qty = public.user_items.qty + v_qty;

  return jsonb_build_object('code', p_code, 'qty', v_qty, 'spent', v_cost);
end; $$;
revoke all on function public.buy_item(text, int) from public;
grant execute on function public.buy_item(text, int) to authenticated;

-- ------------------------------------------------------------
-- 4) RPC: usar ítem sobre una carta
-- ------------------------------------------------------------
create or replace function public.use_item(p_code text, p_card_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_item record; v_card record; v_have int; v_new_stam int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_item from public.items where code = p_code;
  if not found then raise exception 'item not found'; end if;

  select qty into v_have from public.user_items
    where user_id = v_user and item_code = p_code for update;
  if coalesce(v_have, 0) < 1 then raise exception 'no tenés ese ítem'; end if;

  select pc.id, pc.stamina, pc.injury_matches_left, pc.injury_type
    into v_card
    from public.player_cards pc
    where pc.id = p_card_id and pc.owner_id = v_user
    for update;
  if not found then raise exception 'card not found'; end if;

  if v_item.kind = 'heal' then
    if v_card.injury_matches_left <= 0 then
      raise exception 'ese jugador no está lesionado';
    end if;
    if v_card.injury_matches_left > v_item.power then
      raise exception 'ese ítem no alcanza para esta lesión';
    end if;
    update public.player_cards
      set injury_matches_left = 0, injury_type = null
      where id = p_card_id;
  else
    if v_card.stamina >= 100 then
      raise exception 'ese jugador ya está al máximo de energía';
    end if;
    v_new_stam := least(100, v_card.stamina + v_item.power);
    update public.player_cards set stamina = v_new_stam where id = p_card_id;
  end if;

  update public.user_items set qty = qty - 1
    where user_id = v_user and item_code = p_code;

  return jsonb_build_object(
    'code', p_code,
    'card_id', p_card_id,
    'kind', v_item.kind,
    'stamina', coalesce(v_new_stam, v_card.stamina)
  );
end; $$;
revoke all on function public.use_item(text, uuid) from public;
grant execute on function public.use_item(text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 5) RPC: aplicar lesiones tras un partido (lo llama el servidor)
-- ------------------------------------------------------------
create or replace function public.apply_match_injuries(p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  i int; v_inj record; v_total numeric; v_r numeric; v_acc numeric := 0;
  v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Descontar un partido a las lesiones existentes
  update public.player_cards
    set injury_matches_left = injury_matches_left - 1,
        injury_type = case when injury_matches_left - 1 <= 0 then null else injury_type end
    where owner_id = v_user and injury_matches_left > 0;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return v_out;
  end if;

  select sum(weight) into v_total from public.injury_types;

  for i in 1..array_length(p_card_ids, 1) loop
    -- ~4% de probabilidad por jugador que disputó el partido
    if random() < 0.04 then
      v_r := random() * v_total;
      v_acc := 0;
      for v_inj in select * from public.injury_types order by code loop
        v_acc := v_acc + v_inj.weight;
        if v_r <= v_acc then
          update public.player_cards
            set injury_type = v_inj.code,
                injury_matches_left = v_inj.severity
            where id = p_card_ids[i] and owner_id = v_user
              and injury_matches_left = 0;
          if found then
            v_out := v_out || jsonb_build_object(
              'card_id', p_card_ids[i],
              'type', v_inj.code,
              'name', v_inj.name,
              'matches', v_inj.severity
            );
          end if;
          exit;
        end if;
      end loop;
    end if;
  end loop;

  return v_out;
end; $$;
revoke all on function public.apply_match_injuries(uuid[]) from public;
grant execute on function public.apply_match_injuries(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.injury_types) as tipos_lesion,
  (select count(*) from public.items)        as items,
  (select count(*) from public.items where kind='heal')    as items_curacion,
  (select count(*) from public.items where kind='stamina') as items_energia;
