-- ============================================================
-- SOBRE DE POSICIONES
--
-- Cuesta 3.000 monedas y da 3 cambios de posición al azar. Cada
-- cambio va de una posición concreta a otra (CB → RB, RW → ST, etc.)
-- y se aplica a UN jugador puntual que tenga la posición de origen.
--
-- No hay saltos absurdos: para pasar un central a delantero hacen
-- falta varios cambios encadenados. El arquero queda afuera: sus
-- estadísticas son de otra naturaleza.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Catálogo de cambios de posición
-- ------------------------------------------------------------
create table if not exists public.position_changes (
  code    text primary key,
  from_pos text not null,
  to_pos   text not null,
  weight   numeric not null default 10
);
alter table public.position_changes enable row level security;
drop policy if exists "poschanges_read" on public.position_changes;
create policy "poschanges_read" on public.position_changes for select using (true);

insert into public.position_changes (code, from_pos, to_pos, weight) values
  -- Defensa
  ('cb_rb','CB','RB',12), ('rb_cb','RB','CB',12),
  ('cb_lb','CB','LB',12), ('lb_cb','LB','CB',12),
  ('rb_rwb','RB','RWB',10), ('rwb_rb','RWB','RB',10),
  ('lb_lwb','LB','LWB',10), ('lwb_lb','LWB','LB',10),
  ('cb_cdm','CB','CDM',8),
  ('rb_rm','RB','RM',8), ('lb_lm','LB','LM',8),
  ('rwb_rm','RWB','RM',8), ('lwb_lm','LWB','LM',8),
  -- Mediocampo
  ('cdm_cm','CDM','CM',12), ('cm_cdm','CM','CDM',12),
  ('cm_cam','CM','CAM',12), ('cam_cm','CAM','CM',12),
  ('cdm_cb','CDM','CB',8),
  ('cm_rm','CM','RM',10), ('rm_cm','RM','CM',10),
  ('cm_lm','CM','LM',10), ('lm_cm','LM','CM',10),
  ('rm_rw','RM','RW',10), ('rw_rm','RW','RM',10),
  ('lm_lw','LM','LW',10), ('lw_lm','LW','LM',10),
  ('cam_cf','CAM','CF',8),
  -- Ataque
  ('rw_lw','RW','LW',9), ('lw_rw','LW','RW',9),
  ('rw_st','RW','ST',8), ('lw_st','LW','ST',8),
  ('cf_st','CF','ST',10), ('st_cf','ST','CF',10),
  ('cf_cam','CF','CAM',7)
on conflict (code) do update
  set from_pos = excluded.from_pos,
      to_pos = excluded.to_pos,
      weight = excluded.weight;

-- ------------------------------------------------------------
-- 2) Los cambios se guardan en el inventario del usuario
-- ------------------------------------------------------------
create table if not exists public.user_position_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  code    text not null references public.position_changes(code),
  qty     int  not null default 0,
  primary key (user_id, code)
);
alter table public.user_position_changes enable row level security;
drop policy if exists "upc_own" on public.user_position_changes;
create policy "upc_own" on public.user_position_changes
  for select using (auth.uid() = user_id);

-- La carta guarda su posición cambiada (null = la del catálogo)
alter table public.player_cards
  add column if not exists position_override text;

-- ------------------------------------------------------------
-- 3) Comprar el sobre: 3.000 monedas, 3 cambios al azar
-- ------------------------------------------------------------
create or replace function public.buy_position_pack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_coins bigint; v_price bigint := 3000;
  v_total numeric; v_r numeric; v_acc numeric; v_pick record;
  i int; v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'position_pack', 'pack', v_coins - v_price);

  select sum(weight) into v_total from public.position_changes;

  for i in 1..3 loop
    v_r := random() * v_total;
    v_acc := 0;
    for v_pick in select * from public.position_changes order by code loop
      v_acc := v_acc + v_pick.weight;
      if v_r <= v_acc then
        insert into public.user_position_changes(user_id, code, qty)
          values (v_user, v_pick.code, 1)
        on conflict (user_id, code)
          do update set qty = public.user_position_changes.qty + 1;
        v_out := v_out || jsonb_build_object(
          'code', v_pick.code,
          'from_pos', v_pick.from_pos,
          'to_pos', v_pick.to_pos
        );
        exit;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('changes', v_out, 'price', v_price);
end; $$;
revoke all on function public.buy_position_pack() from public;
grant execute on function public.buy_position_pack() to authenticated;

-- ------------------------------------------------------------
-- 4) Aplicar un cambio a UN jugador
-- ------------------------------------------------------------
create or replace function public.apply_position_change(
  p_code text, p_card_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_ch record; v_have int; v_pos text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_ch from public.position_changes where code = p_code;
  if not found then raise exception 'cambio no encontrado'; end if;

  select qty into v_have from public.user_position_changes
    where user_id = v_user and code = p_code for update;
  if coalesce(v_have, 0) < 1 then raise exception 'no tenés ese cambio'; end if;

  -- Posición actual del jugador (la cambiada si ya tuvo una)
  select coalesce(pc.position_override, t.position::text) into v_pos
    from public.player_cards pc
    join public.player_templates t on t.id = pc.template_id
    where pc.id = p_card_id and pc.owner_id = v_user;
  if v_pos is null then raise exception 'jugador no encontrado'; end if;

  if v_pos <> v_ch.from_pos then
    raise exception 'ese cambio es para un % y el jugador es %',
      v_ch.from_pos, v_pos;
  end if;

  update public.player_cards
    set position_override = v_ch.to_pos
    where id = p_card_id and owner_id = v_user;

  update public.user_position_changes set qty = qty - 1
    where user_id = v_user and code = p_code;

  return jsonb_build_object('from', v_ch.from_pos, 'to', v_ch.to_pos);
end; $$;
revoke all on function public.apply_position_change(text, uuid) from public;
grant execute on function public.apply_position_change(text, uuid) to authenticated;

-- Mis cambios disponibles
create or replace function public.my_position_changes()
returns TABLE("code" text, "from_pos" text, "to_pos" text, "qty" int)
language sql stable security definer set search_path = public as $$
  select u.code, p.from_pos, p.to_pos, u.qty
  from public.user_position_changes u
  join public.position_changes p on p.code = u.code
  where u.user_id = auth.uid() and u.qty > 0
  order by p.from_pos, p.to_pos;
$$;
grant execute on function public.my_position_changes() to authenticated;

select count(*) as cambios_disponibles from public.position_changes;
