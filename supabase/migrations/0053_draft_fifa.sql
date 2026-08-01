-- ============================================================
-- DRAFT ESTILO FIFA
--
-- 1. Se eligen 16 jugadores: los 11 del once + 5 suplentes.
-- 2. Los candidatos favorecen las cinco grandes ligas (salen más
--    seguido), pero los del resto del mundo también son buenas
--    cartas: cambia la frecuencia, no la calidad.
-- 3. Terminado el sorteo se puede cambiar la formación y mover
--    jugadores entre el once y el banco antes de jugar.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Columna para guardar la alineación armada por el usuario
--    (código de hueco + índice del jugador elegido)
-- ------------------------------------------------------------
alter table public.draft_runs
  add column if not exists lineup jsonb;

-- ------------------------------------------------------------
-- 1) Huecos: 11 del once (según formación) + 5 del banco
-- ------------------------------------------------------------
create or replace function public._draft_slots(p_formation text)
returns TABLE("pos" text, "code" text)
language sql immutable as $$
  select * from (values
    ('GK','GK'), ('CB','LCB'), ('CB','RCB'), ('LB','LB'), ('RB','RB'),
    ('CM','LCM'), ('CM','CM'), ('CM','RCM'),
    ('LW','LW'), ('ST','ST'), ('RW','RW'),
    -- Suplentes: se ofrecen por puesto para que el banco sea útil
    -- Banco de 8: arquero, defensa, mediocampo y ataque
    ('GK','SUB1'), ('CB','SUB2'), ('LB','SUB3'), ('CM','SUB4'),
    ('CM','SUB5'), ('LW','SUB6'), ('ST','SUB7'), ('RW','SUB8')
  ) as t(pos, code);
$$;
revoke all on function public._draft_slots(text) from public;

-- ------------------------------------------------------------
-- 2) Candidatos: sesgo a las cinco grandes ligas
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
    -- Peso al azar: las grandes ligas salen bastante más seguido,
    -- pero cualquiera puede aparecer (nada queda excluido).
    order by random() * (
      case when i.league_name in (
        'English Premier League', 'Spain Primera Division', 'Italian Serie A',
        'German 1. Bundesliga', 'French Ligue 1'
      ) then 1.0 else 2.6 end
    )
    limit 5
  loop
    v_out := v_out || jsonb_build_object(
      'template_id', r.template_id, 'name', r.name, 'position', r.position,
      'overall', r.overall, 'rarity', r.rarity, 'attributes', r.attributes,
      'gk_attributes', r.gk_attributes, 'club_name', r.club_name,
      'league_name', r.league_name, 'nationality', r.nationality
    );
  end loop;

  -- Respaldo si el filtro dejó el puesto sin opciones
  if jsonb_array_length(v_out) < 5 then
    v_out := '[]'::jsonb;
    for r in
      select t.id as template_id, t.overall, t.position, t.attributes,
             t.gk_attributes, t.rarity,
             i.name, i.club_name, i.league_name, i.nationality
      from public.player_templates t
      join public.player_identities i on i.id = t.identity_id
      where t.position = p_position and not (t.id = any(p_exclude))
      order by t.overall desc
      limit 40
    loop
      v_out := v_out || jsonb_build_object(
        'template_id', r.template_id, 'name', r.name, 'position', r.position,
        'overall', r.overall, 'rarity', r.rarity, 'attributes', r.attributes,
        'gk_attributes', r.gk_attributes, 'club_name', r.club_name,
        'league_name', r.league_name, 'nationality', r.nationality
      );
      exit when jsonb_array_length(v_out) >= 5;
    end loop;
  end if;

  return v_out;
end; $$;

-- ------------------------------------------------------------
-- 3) Cambiar formación y mover jugadores antes de jugar
--    p_lineup: [{"idx":0,"slot":"GK","slot_pos":"GK"}, ...]
--    Los 11 primeros son el once; el resto, el banco.
-- ------------------------------------------------------------
create or replace function public.draft_set_lineup(
  p_run_id uuid, p_formation text, p_lineup jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); r record; v_new jsonb := '[]'::jsonb;
  v_item jsonb; v_pick jsonb; v_starters int := 0;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into r from public.draft_runs
    where id = p_run_id and user_id = v_user for update;
  if not found then raise exception 'draft no encontrado'; end if;
  if r.status <> 'playing' then
    raise exception 'la alineación solo se cambia antes de jugar';
  end if;
  if jsonb_array_length(p_lineup) <> jsonb_array_length(r.picks) then
    raise exception 'faltan jugadores en la alineación';
  end if;

  -- Se reordenan los fichajes ya sorteados; no se agregan ni quitan
  for v_item in select * from jsonb_array_elements(p_lineup) loop
    v_pick := r.picks -> (v_item->>'idx')::int;
    if v_pick is null then raise exception 'jugador inválido'; end if;
    v_pick := v_pick
      || jsonb_build_object('slot', v_item->>'slot', 'slot_pos', v_item->>'slot_pos');
    v_new := v_new || v_pick;
    if (v_item->>'slot') not like 'SUB%' then v_starters := v_starters + 1; end if;
  end loop;

  if v_starters <> 11 then
    raise exception 'el once tiene que tener 11 jugadores';
  end if;

  update public.draft_runs
    set picks = v_new, formation = coalesce(p_formation, formation)
    where id = p_run_id;

  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.draft_set_lineup(uuid, text, jsonb) from public;
grant execute on function public.draft_set_lineup(uuid, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 4) my_draft ahora devuelve también la alineación guardada
-- ------------------------------------------------------------
create or replace function public.my_draft()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'run_id', d.id,
    'status', d.status,
    'formation', d.formation,
    'slot_index', d.slot_index,
    'total', (select count(*) from public._draft_slots(d.formation)),
    'position', (
      select s.pos from public._draft_slots(d.formation)
        with ordinality as s(pos, code, idx)
      where idx = d.slot_index + 1
    ),
    'picks', coalesce(d.picks, '[]'::jsonb),
    'candidates', d.candidates,
    'lineup', d.lineup,
    'wins', d.wins,
    'losses', d.losses
  )
  from public.draft_runs d
  where d.user_id = auth.uid() and d.status in ('drafting', 'playing')
  order by d.created_at desc limit 1;
$$;
grant execute on function public.my_draft() to authenticated;

select 'draft con banco y grandes ligas listo' as resultado;
