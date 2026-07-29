-- ============================================================
-- FASE 5 — Economía y sobres
-- Toda mutación de monedas/cartas pasa por RPC transaccional
-- (SECURITY DEFINER) + ledger. Cartas creadas SOLO en el servidor.
-- ============================================================

-- ------------------------------------------------------------
-- Ledger de monedas (append-only, auditable). profiles.coins = caché.
-- ------------------------------------------------------------
create table if not exists public.coin_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  delta         bigint not null,
  reason        text not null,      -- match_reward | pack_buy | quick_sell | ...
  ref           text,
  balance_after bigint not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ledger_user on public.coin_ledger (user_id, created_at desc);
create index if not exists idx_ledger_reason_ref on public.coin_ledger (user_id, reason, ref);
alter table public.coin_ledger enable row level security;
create policy "ledger_select_own" on public.coin_ledger
  for select using (auth.uid() = user_id);
-- Sin insert/update/delete para usuarios: solo escriben las RPC.

alter table public.matches add column if not exists reward_coins int;

-- ------------------------------------------------------------
-- Sobres
-- ------------------------------------------------------------
create table if not exists public.packs (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  description text,
  price_coins bigint,
  price_gems  int,
  drop_table  jsonb not null,   -- {size, weights:{rarity:peso}, guaranteed:[{minRarity}]}
  active      boolean not null default true,
  sort        int not null default 0
);
alter table public.packs enable row level security;
create policy "packs_read" on public.packs for select using (active);

create table if not exists public.pack_openings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pack_id    uuid not null references public.packs(id),
  seed       text not null,
  results    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pack_openings enable row level security;
create policy "openings_own" on public.pack_openings
  for select using (auth.uid() = user_id);

insert into public.packs (code, name, description, price_coins, drop_table, sort) values
  ('bronze', 'Sobre Bronce', '4 jugadores. Ideal para empezar.', 400,
    '{"size":4,"weights":{"common":70,"uncommon":24,"rare":5,"epic":1,"legendary":0,"icon":0},"guaranteed":[]}', 10),
  ('silver', 'Sobre Plata', '5 jugadores, con al menos uno poco común.', 1200,
    '{"size":5,"weights":{"common":45,"uncommon":35,"rare":15,"epic":4,"legendary":0.9,"icon":0.1},"guaranteed":[{"minRarity":"uncommon"}]}', 20),
  ('gold', 'Sobre Oro', '5 jugadores, con al menos uno raro.', 5000,
    '{"size":5,"weights":{"common":20,"uncommon":30,"rare":32,"epic":14,"legendary":3.5,"icon":0.5},"guaranteed":[{"minRarity":"rare"}]}', 30),
  ('special', 'Sobre Especial', '5 jugadores de alto nivel, con épico asegurado.', 15000,
    '{"size":5,"weights":{"common":0,"uncommon":15,"rare":35,"epic":33,"legendary":14,"icon":3},"guaranteed":[{"minRarity":"epic"}]}', 40)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- Helpers internos (rareza)
-- ------------------------------------------------------------
create or replace function public._rarity_rank(p text)
returns int language sql immutable as $$
  select case p
    when 'common' then 0 when 'uncommon' then 1 when 'rare' then 2
    when 'epic' then 3 when 'legendary' then 4 when 'icon' then 5 else 0 end;
$$;

create or replace function public._filter_weights(p_weights jsonb, p_min text)
returns jsonb language plpgsql immutable as $$
declare res jsonb := '{}'::jsonb; k text; v text; minr int := public._rarity_rank(p_min);
begin
  for k, v in select key, value from jsonb_each_text(p_weights) loop
    if public._rarity_rank(k) >= minr then
      res := res || jsonb_build_object(k, v::numeric);
    end if;
  end loop;
  if res = '{}'::jsonb then return p_weights; end if;
  return res;
end; $$;

create or replace function public._pick_rarity(p_weights jsonb)
returns text language plpgsql as $$
declare total numeric := 0; r numeric; k text; v numeric; acc numeric := 0;
begin
  select coalesce(sum(value::numeric), 0) into total from jsonb_each_text(p_weights);
  if total <= 0 then return 'common'; end if;
  r := random() * total;
  for k, v in select key, value::numeric from jsonb_each_text(p_weights) loop
    acc := acc + v;
    if r <= acc then return k; end if;
  end loop;
  return 'common';
end; $$;

-- ------------------------------------------------------------
-- RPC: recompensa de partido (idempotente, con rendimientos decrecientes)
-- ------------------------------------------------------------
create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_m record; v_rating int; v_base bigint; v_mult numeric;
  v_today int; v_reward bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select m.home_user, m.winner, m.ai_opponent, ao.rating as ai_rating
    into v_m
    from public.matches m
    left join public.ai_opponents ao on ao.id = m.ai_opponent
    where m.id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if v_m.home_user <> v_user then raise exception 'not your match'; end if;

  -- idempotencia: un partido paga una sola vez
  if exists (
    select 1 from public.coin_ledger
    where user_id = v_user and reason = 'match_reward' and ref = p_match_id::text
  ) then
    return 0;
  end if;

  v_rating := coalesce(v_m.ai_rating, 70);
  v_base := case
    when v_m.winner = 'home' then 150 + v_rating * 4
    when v_m.winner = 'draw' then 90 + v_rating * 2
    else 50 end;

  -- rendimientos decrecientes por partidos recompensados hoy (anti-farmeo)
  select count(*) into v_today from public.coin_ledger
    where user_id = v_user and reason = 'match_reward'
      and created_at >= date_trunc('day', now());
  v_mult := greatest(0.25, 1 - v_today * 0.08);
  v_reward := floor(v_base * v_mult);

  select coins into v_coins from public.profiles where id = v_user for update;
  update public.profiles set coins = coins + v_reward where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_reward, 'match_reward', p_match_id::text, v_coins + v_reward);
  update public.matches set reward_coins = v_reward where id = p_match_id;

  return v_reward;
end; $$;
revoke all on function public.grant_match_reward(uuid) from public;
grant execute on function public.grant_match_reward(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: abrir sobre (cobra, resuelve cartas con probabilidades reales,
-- inserta las cartas, todo atómico e idempotente)
-- ------------------------------------------------------------
create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text; v_tpl record; v_new uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if exists (
    select 1 from public.pack_openings
    where user_id = v_user and results->>'idem' = p_idem
  ) then
    raise exception 'duplicate operation';
  end if;

  select * into v_pack from public.packs where id = p_pack_id and active;
  if not found then raise exception 'pack not available'; end if;

  v_size := coalesce((v_pack.drop_table->>'size')::int, 5);
  v_weights := v_pack.drop_table->'weights';
  v_guaranteed := coalesce(v_pack.drop_table->'guaranteed', '[]'::jsonb);
  v_price := coalesce(v_pack.price_coins, 0);

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'pack_buy', p_pack_id::text, v_coins - v_price);

  for i in 0..(v_size - 1) loop
    v_wslot := v_weights;
    if i < jsonb_array_length(v_guaranteed) then
      v_minr := v_guaranteed->i->>'minRarity';
      if v_minr is not null then
        v_wslot := public._filter_weights(v_weights, v_minr);
      end if;
    end if;
    v_rarity := public._pick_rarity(v_wslot);

    select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id, pt.attributes
      into v_tpl
      from public.player_templates pt
      where pt.rarity = v_rarity
      order by random() limit 1;
    if v_tpl.id is null then
      select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id, pt.attributes
        into v_tpl
        from public.player_templates pt
        order by random() limit 1;
    end if;

    insert into public.player_cards(template_id, owner_id)
      values (v_tpl.id, v_user) returning id into v_new;

    v_results := v_results || jsonb_build_object(
      'card_id', v_new,
      'template_id', v_tpl.id,
      'rarity', v_tpl.rarity,
      'overall', v_tpl.overall,
      'position', v_tpl.position,
      'attributes', v_tpl.attributes,
      'name', (select name from public.player_identities where id = v_tpl.identity_id)
    );
  end loop;

  insert into public.pack_openings(user_id, pack_id, seed, results)
    values (v_user, p_pack_id, v_seed,
      jsonb_build_object('idem', p_idem, 'seed', v_seed, 'cards', v_results));

  return jsonb_build_object('cards', v_results, 'seed', v_seed);
end; $$;
revoke all on function public.open_pack(uuid, text) from public;
grant execute on function public.open_pack(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- RPC: venta rápida (descarte por monedas). Sink para duplicados.
-- ------------------------------------------------------------
create or replace function public.quick_sell(p_card_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_card record; v_val bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select pc.id, pc.bound, pc.status, pt.rarity, pt.overall
    into v_card
    from public.player_cards pc
    join public.player_templates pt on pt.id = pc.template_id
    where pc.id = p_card_id and pc.owner_id = v_user
    for update;
  if not found then raise exception 'card not found'; end if;
  if v_card.bound then raise exception 'card is bound'; end if;
  if v_card.status <> 'in_club' then raise exception 'card not sellable'; end if;

  v_val := case v_card.rarity
    when 'common' then 40 when 'uncommon' then 110 when 'rare' then 280
    when 'epic' then 750 when 'legendary' then 1800 when 'icon' then 4500 else 40 end;
  v_val := v_val + greatest(0, v_card.overall - 60) * 5;

  delete from public.player_cards where id = p_card_id;  -- quita también su slot (cascade)
  select coins into v_coins from public.profiles where id = v_user for update;
  update public.profiles set coins = coins + v_val where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_val, 'quick_sell', p_card_id::text, v_coins + v_val);
  return v_val;
end; $$;
revoke all on function public.quick_sell(uuid) from public;
grant execute on function public.quick_sell(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: sobre de bienvenida (reemplaza dev_grant_starter_cards).
-- Reparte un plantel base balanceado una sola vez.
-- ------------------------------------------------------------
create or replace function public.claim_welcome()
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if;

  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from public.player_templates t where t.position = 'GK'
       order by random() limit 3)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CB','RB','LB') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CDM','CM','CAM','RM','LM') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('RW','LW','ST') order by random() limit 6)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  return v_count;
end; $$;
revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;
