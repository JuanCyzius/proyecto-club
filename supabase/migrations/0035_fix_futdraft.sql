-- ============================================================
-- FIX FUT DRAFT
--
-- 1. Los candidatos por puesto podían repetir el mismo jugador que
--    ya habías elegido en otro puesto (o incluso volver a ofrecerlo
--    en el mismo puesto). Ahora se excluyen los ya elegidos.
-- 2. Entrada del draft: 2000 monedas (antes 2500).
-- 3. Máximo 3 drafts por día (ventana móvil de 24hs).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Candidatos: ahora reciben la lista de templates ya elegidos
--    y nunca los repiten.
-- ------------------------------------------------------------
create or replace function public._draft_candidates(
  p_position text,
  p_exclude uuid[] default '{}'
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := '[]'::jsonb; r record; v_min int;
begin
  v_min := case when p_position = 'GK' then 78 else 79 end;

  for r in
    select t.id as template_id, t.overall, t.position, t.attributes,
           t.gk_attributes, t.rarity,
           i.name, i.club_name, i.league_name, i.nationality
    from public.player_templates t
    join public.player_identities i on i.id = t.identity_id
    where t.position = p_position
      and t.overall >= v_min
      and not (t.id = any(p_exclude))
    order by random()
    limit 5
  loop
    v_out := v_out || jsonb_build_object(
      'template_id', r.template_id,
      'name', r.name,
      'position', r.position,
      'overall', r.overall,
      'rarity', r.rarity,
      'attributes', r.attributes,
      'gk_attributes', r.gk_attributes,
      'club_name', r.club_name,
      'league_name', r.league_name,
      'nationality', r.nationality
    );
  end loop;

  -- Respaldo si el puesto se quedó sin candidatos de nivel alto
  -- (por el filtro de excluidos): se baja el listón progresivamente.
  if jsonb_array_length(v_out) < 5 then
    v_out := '[]'::jsonb;
    for r in
      select t.id as template_id, t.overall, t.position, t.attributes,
             t.gk_attributes, t.rarity,
             i.name, i.club_name, i.league_name, i.nationality
      from public.player_templates t
      join public.player_identities i on i.id = t.identity_id
      where t.position = p_position
        and not (t.id = any(p_exclude))
      order by t.overall desc
      limit 40
    loop
      v_out := v_out || jsonb_build_object(
        'template_id', r.template_id,
        'name', r.name,
        'position', r.position,
        'overall', r.overall,
        'rarity', r.rarity,
        'attributes', r.attributes,
        'gk_attributes', r.gk_attributes,
        'club_name', r.club_name,
        'league_name', r.league_name,
        'nationality', r.nationality
      );
      exit when jsonb_array_length(v_out) >= 5;
    end loop;
  end if;

  return v_out;
end; $$;

-- ------------------------------------------------------------
-- 2) Empezar un draft: entrada 2000 + máximo 3 por día.
-- ------------------------------------------------------------
update public.draft_config set entry_coins = 2000 where id = 1;

create or replace function public.draft_start(p_formation text default '4-3-3')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_cfg record; v_coins bigint;
  v_id uuid; v_pos text; v_cands jsonb; v_today int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_cfg from public.draft_config where id = 1 and active;
  if not found then raise exception 'el modo draft no está disponible'; end if;

  -- Solo un draft activo a la vez
  if exists (select 1 from public.draft_runs
             where user_id = v_user and status in ('drafting', 'playing')) then
    raise exception 'ya tenés un draft en curso';
  end if;

  -- Máximo 3 drafts por día (ventana móvil de 24hs)
  select count(*) into v_today from public.draft_runs
    where user_id = v_user and created_at >= now() - interval '24 hours';
  if v_today >= 3 then
    raise exception 'ya jugaste 3 drafts hoy, volvé mañana';
  end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_cfg.entry_coins then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_cfg.entry_coins where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_cfg.entry_coins, 'draft_entry', 'draft',
            v_coins - v_cfg.entry_coins);

  insert into public.draft_runs (user_id, formation, entry_paid)
    values (v_user, p_formation, v_cfg.entry_coins)
    returning id into v_id;

  -- Primer puesto a elegir
  select pos into v_pos from public._draft_slots(p_formation) with ordinality
    as x(pos, code, idx) where idx = 1;
  v_cands := public._draft_candidates(v_pos, '{}');
  update public.draft_runs set candidates = v_cands where id = v_id;

  return jsonb_build_object('run_id', v_id, 'position', v_pos, 'candidates', v_cands);
end; $$;
revoke all on function public.draft_start(text) from public;
grant execute on function public.draft_start(text) to authenticated;

-- ------------------------------------------------------------
-- 3) Elegir candidato: ahora excluye los templates ya elegidos
--    al pedir las opciones del siguiente puesto.
-- ------------------------------------------------------------
create or replace function public.draft_pick(p_run_id uuid, p_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); r record; v_pick jsonb; v_next int;
  v_pos text; v_code text; v_cands jsonb; v_total int; v_exclude uuid[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into r from public.draft_runs
    where id = p_run_id and user_id = v_user for update;
  if not found then raise exception 'draft no encontrado'; end if;
  if r.status <> 'drafting' then raise exception 'ese draft ya está armado'; end if;

  if p_index < 0 or p_index >= jsonb_array_length(r.candidates) then
    raise exception 'opción inválida';
  end if;

  select count(*) into v_total from public._draft_slots(r.formation);

  -- Guardar la elección con el puesto que ocupa
  select s.pos, s.code into v_pos, v_code
    from public._draft_slots(r.formation) with ordinality as s(pos, code, idx)
    where idx = r.slot_index + 1;

  v_pick := (r.candidates -> p_index) || jsonb_build_object('slot', v_code, 'slot_pos', v_pos);
  v_next := r.slot_index + 1;

  -- Templates ya elegidos (incluyendo el que se acaba de elegir), para
  -- no volver a ofrecerlos en los puestos que faltan.
  select array_agg((elem->>'template_id')::uuid) into v_exclude
    from jsonb_array_elements(r.picks || v_pick) as elem;

  if v_next >= v_total then
    -- Once completo
    update public.draft_runs
      set picks = r.picks || v_pick,
          slot_index = v_next,
          candidates = null,
          status = 'playing'
      where id = p_run_id;
    return jsonb_build_object('done', true, 'picks', r.picks || v_pick);
  end if;

  -- Siguiente puesto
  select s.pos into v_pos
    from public._draft_slots(r.formation) with ordinality as s(pos, code, idx)
    where idx = v_next + 1;
  v_cands := public._draft_candidates(v_pos, coalesce(v_exclude, '{}'));

  update public.draft_runs
    set picks = r.picks || v_pick,
        slot_index = v_next,
        candidates = v_cands
    where id = p_run_id;

  return jsonb_build_object(
    'done', false, 'position', v_pos,
    'candidates', v_cands, 'slot_index', v_next, 'total', v_total
  );
end; $$;
revoke all on function public.draft_pick(uuid, int) from public;
grant execute on function public.draft_pick(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- 4) Cuántos drafts van jugados hoy (para mostrarlo en la UI).
-- ------------------------------------------------------------
create or replace function public.my_draft_runs_today()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.draft_runs
  where user_id = auth.uid() and created_at >= now() - interval '24 hours';
$$;
grant execute on function public.my_draft_runs_today() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select entry_coins from public.draft_config where id = 1) as entrada_actual;
