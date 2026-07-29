-- ============================================================
-- FASE 2 (v2) — BASE DE JUGADORES REAL DESDE CSV
-- Reemplaza por completo el catálogo ficticio de ejemplo.
-- El CSV es la ÚNICA fuente de verdad: no se inventa ningún dato.
--
-- ORDEN DE USO (ver supabase/import/README.md):
--   1. Ejecutar esta migración
--   2. Importar players_22.csv en la tabla public.players_import
--   3. Ejecutar:  select public.import_players_from_staging();
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla de staging (todo TEXT: la importación nunca falla por tipos)
-- ------------------------------------------------------------
drop table if exists public.players_import;
create table public.players_import (
  "sofifa_id" text,
  "player_url" text,
  "short_name" text,
  "long_name" text,
  "player_positions" text,
  "overall" text,
  "potential" text,
  "value_eur" text,
  "wage_eur" text,
  "age" text,
  "dob" text,
  "height_cm" text,
  "weight_kg" text,
  "club_team_id" text,
  "club_name" text,
  "league_name" text,
  "league_level" text,
  "club_position" text,
  "club_jersey_number" text,
  "club_loaned_from" text,
  "club_joined" text,
  "club_contract_valid_until" text,
  "nationality_id" text,
  "nationality_name" text,
  "nation_team_id" text,
  "nation_position" text,
  "nation_jersey_number" text,
  "preferred_foot" text,
  "weak_foot" text,
  "skill_moves" text,
  "international_reputation" text,
  "work_rate" text,
  "body_type" text,
  "real_face" text,
  "release_clause_eur" text,
  "player_tags" text,
  "player_traits" text,
  "pace" text,
  "shooting" text,
  "passing" text,
  "dribbling" text,
  "defending" text,
  "physic" text,
  "attacking_crossing" text,
  "attacking_finishing" text,
  "attacking_heading_accuracy" text,
  "attacking_short_passing" text,
  "attacking_volleys" text,
  "skill_dribbling" text,
  "skill_curve" text,
  "skill_fk_accuracy" text,
  "skill_long_passing" text,
  "skill_ball_control" text,
  "movement_acceleration" text,
  "movement_sprint_speed" text,
  "movement_agility" text,
  "movement_reactions" text,
  "movement_balance" text,
  "power_shot_power" text,
  "power_jumping" text,
  "power_stamina" text,
  "power_strength" text,
  "power_long_shots" text,
  "mentality_aggression" text,
  "mentality_interceptions" text,
  "mentality_positioning" text,
  "mentality_vision" text,
  "mentality_penalties" text,
  "mentality_composure" text,
  "defending_marking_awareness" text,
  "defending_standing_tackle" text,
  "defending_sliding_tackle" text,
  "goalkeeping_diving" text,
  "goalkeeping_handling" text,
  "goalkeeping_kicking" text,
  "goalkeeping_positioning" text,
  "goalkeeping_reflexes" text,
  "goalkeeping_speed" text,
  "ls" text,
  "st" text,
  "rs" text,
  "lw" text,
  "lf" text,
  "cf" text,
  "rf" text,
  "rw" text,
  "lam" text,
  "cam" text,
  "ram" text,
  "lm" text,
  "lcm" text,
  "cm" text,
  "rcm" text,
  "rm" text,
  "lwb" text,
  "ldm" text,
  "cdm" text,
  "rdm" text,
  "rwb" text,
  "lb" text,
  "lcb" text,
  "cb" text,
  "rcb" text,
  "rb" text,
  "gk" text,
  "player_face_url" text,
  "club_logo_url" text,
  "club_flag_url" text,
  "nation_logo_url" text,
  "nation_flag_url" text
);

-- ------------------------------------------------------------
-- 2) Ampliar el esquema para guardar TODA la información del CSV
-- ------------------------------------------------------------
alter table public.player_identities
  add column if not exists source_id      int,          -- sofifa_id
  add column if not exists long_name      text,
  add column if not exists dob            date,
  add column if not exists height_cm      int,
  add column if not exists weight_kg      int,
  add column if not exists club_name      text,
  add column if not exists league_name    text,
  add column if not exists league_level   int,
  add column if not exists preferred_foot text,
  add column if not exists weak_foot      int,
  add column if not exists skill_moves    int,
  add column if not exists work_rate      text,
  add column if not exists body_type      text,
  add column if not exists international_reputation int,
  add column if not exists player_traits  text,
  add column if not exists player_tags    text;

-- Índice único NO parcial: hace falta para que el ON CONFLICT de la
-- importación pueda inferirlo. Los NULL son distintos entre sí en
-- PostgreSQL, así que las filas sin source_id no chocan.
create unique index if not exists idx_identities_source
  on public.player_identities (source_id);

alter table public.player_templates
  add column if not exists positions     text[],   -- todas: principal + secundarias
  add column if not exists gk_attributes jsonb,    -- stats de portero
  add column if not exists detail        jsonb,    -- técnicos/físicos/mentales
  add column if not exists value_eur     bigint,
  add column if not exists wage_eur      bigint;

create index if not exists idx_templates_positions
  on public.player_templates using gin (positions);
create index if not exists idx_templates_overall_desc
  on public.player_templates (overall desc);

-- ------------------------------------------------------------
-- 3) Helpers
-- ------------------------------------------------------------
-- Texto -> int seguro. Se queda con la parte entera: el CSV trae
-- value_eur/wage_eur como "78000000.0" y hay que truncar en el punto,
-- no borrarlo (borrarlo multiplicaría el valor por 10).
create or replace function public._n(t text)
returns int language sql immutable as $$
  select nullif(
    regexp_replace(split_part(trim(coalesce(t, '')), '.', 1), '[^0-9-]', '', 'g'),
    ''
  )::int;
$$;

-- Rareza derivada del overall (concepto del juego, no del CSV).
-- Bandas calibradas sobre la distribución real del dataset.
create or replace function public._rarity_from_overall(o int)
returns text language sql immutable as $$
  select case
    when o >= 89 then 'icon'
    when o >= 84 then 'legendary'
    when o >= 78 then 'epic'
    when o >= 72 then 'rare'
    when o >= 65 then 'uncommon'
    else 'common' end;
$$;

-- Posiciones del CSV -> posiciones del juego.
-- CF, RWB y LWB ahora existen en el juego, así que se conservan tal cual.
create or replace function public._map_position(p text)
returns text language sql immutable as $$
  select case upper(trim(p))
    when 'GK' then 'GK'   when 'CB'  then 'CB'  when 'RB'  then 'RB'
    when 'LB' then 'LB'   when 'RWB' then 'RWB' when 'LWB' then 'LWB'
    when 'CDM' then 'CDM' when 'CM'  then 'CM'  when 'CAM' then 'CAM'
    when 'RM' then 'RM'   when 'LM'  then 'LM'  when 'RW'  then 'RW'
    when 'LW' then 'LW'   when 'CF'  then 'CF'  when 'ST'  then 'ST'
    else 'CM' end;
$$;

-- ------------------------------------------------------------
-- 4) Importación desde staging (idempotente)
-- ------------------------------------------------------------
create or replace function public.import_players_from_staging()
returns TABLE(identidades int, jugadores int, porteros int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staged int;
  v_ident  int;
  v_tpl    int;
  v_gk     int;
begin
  select count(*) into v_staged from public.players_import;
  if v_staged = 0 then
    raise exception 'players_import está vacía: importá primero players_22.csv en esa tabla';
  end if;

  -- Limpiar catálogo anterior (jugadores de ejemplo).
  -- Las cartas de usuarios que apuntaban a ellos se eliminan en cascada,
  -- por eso también se limpian los slots de plantilla huérfanos.
  delete from public.squad_slots
    where card_id in (select id from public.player_cards);
  delete from public.player_cards;
  delete from public.player_templates;
  delete from public.player_identities;

  -- 4a) Identidades (persona real: datos biográficos y de club)
  insert into public.player_identities (
    source_id, name, long_name, nationality, dob, height_cm, weight_kg,
    club_name, league_name, league_level, preferred_foot, weak_foot,
    skill_moves, work_rate, body_type, international_reputation,
    player_traits, player_tags, art_portrait
  )
  select
    public._n(s.sofifa_id),
    nullif(trim(s.short_name), ''),
    nullif(trim(s.long_name), ''),
    nullif(trim(s.nationality_name), ''),
    nullif(trim(s.dob), '')::date,
    public._n(s.height_cm),
    public._n(s.weight_kg),
    nullif(trim(s.club_name), ''),
    nullif(trim(s.league_name), ''),
    public._n(s.league_level),
    nullif(trim(s.preferred_foot), ''),
    public._n(s.weak_foot),
    public._n(s.skill_moves),
    nullif(trim(s.work_rate), ''),
    nullif(trim(s.body_type), ''),
    public._n(s.international_reputation),
    nullif(trim(s.player_traits), ''),
    nullif(trim(s.player_tags), ''),
    nullif(trim(s.player_face_url), '')
  from public.players_import s
  where public._n(s.sofifa_id) is not null
    and nullif(trim(s.short_name), '') is not null
  on conflict (source_id) do nothing;

  get diagnostics v_ident = ROW_COUNT;

  -- 4b) Plantillas (la "versión" jugable de cada identidad)
  insert into public.player_templates (
    identity_id, position, positions, version, rarity, overall, potential,
    age, personality, attributes, gk_attributes, detail,
    value_eur, wage_eur, is_tradeable
  )
  select
    i.id,
    public._map_position(split_part(s.player_positions, ',', 1)),
    (select array_agg(public._map_position(x))
       from unnest(string_to_array(s.player_positions, ',')) as x),
    'base',
    public._rarity_from_overall(public._n(s.overall)),
    public._n(s.overall),
    greatest(public._n(s.potential), public._n(s.overall)),
    public._n(s.age),
    -- Personalidad derivada del work_rate real del CSV (no inventada)
    case
      when s.work_rate like 'High/High%'    then 'trabajador'
      when s.work_rate like 'High/%'        then 'competitivo'
      when s.work_rate like 'Low/%'         then 'tranquilo'
      when s.work_rate like '%/High'        then 'sacrificado'
      else 'equilibrado' end,
    -- Los 6 atributos del juego. Para porteros el CSV no los trae,
    -- así que se derivan de sus stats reales de portería.
    case when public._map_position(split_part(s.player_positions, ',', 1)) = 'GK' then
      jsonb_build_object(
        'pace',      coalesce(public._n(s.goalkeeping_speed), public._n(s.movement_acceleration), 50),
        'shooting',  coalesce(public._n(s.goalkeeping_kicking), 50),
        'passing',   coalesce(public._n(s.attacking_short_passing), 50),
        'dribbling', coalesce(public._n(s.goalkeeping_handling), 50),
        'defending', coalesce((public._n(s.goalkeeping_diving)
                             + public._n(s.goalkeeping_reflexes)
                             + public._n(s.goalkeeping_positioning)) / 3, 50),
        'physical',  coalesce(public._n(s.power_strength), 50)
      )
    else
      jsonb_build_object(
        'pace',      coalesce(public._n(s.pace), 50),
        'shooting',  coalesce(public._n(s.shooting), 50),
        'passing',   coalesce(public._n(s.passing), 50),
        'dribbling', coalesce(public._n(s.dribbling), 50),
        'defending', coalesce(public._n(s.defending), 50),
        'physical',  coalesce(public._n(s.physic), 50)
      )
    end,
    -- Stats de portería tal cual vienen del CSV
    jsonb_strip_nulls(jsonb_build_object(
      'diving',      public._n(s.goalkeeping_diving),
      'handling',    public._n(s.goalkeeping_handling),
      'kicking',     public._n(s.goalkeeping_kicking),
      'positioning', public._n(s.goalkeeping_positioning),
      'reflexes',    public._n(s.goalkeeping_reflexes),
      'speed',       public._n(s.goalkeeping_speed)
    )),
    -- TODOS los atributos detallados del CSV
    jsonb_strip_nulls(jsonb_build_object(
      'attacking_crossing',          public._n(s.attacking_crossing),
      'attacking_finishing',         public._n(s.attacking_finishing),
      'attacking_heading_accuracy',  public._n(s.attacking_heading_accuracy),
      'attacking_short_passing',     public._n(s.attacking_short_passing),
      'attacking_volleys',           public._n(s.attacking_volleys),
      'skill_dribbling',             public._n(s.skill_dribbling),
      'skill_curve',                 public._n(s.skill_curve),
      'skill_fk_accuracy',           public._n(s.skill_fk_accuracy),
      'skill_long_passing',          public._n(s.skill_long_passing),
      'skill_ball_control',          public._n(s.skill_ball_control),
      'movement_acceleration',       public._n(s.movement_acceleration),
      'movement_sprint_speed',       public._n(s.movement_sprint_speed),
      'movement_agility',            public._n(s.movement_agility),
      'movement_reactions',          public._n(s.movement_reactions),
      'movement_balance',            public._n(s.movement_balance),
      'power_shot_power',            public._n(s.power_shot_power),
      'power_jumping',               public._n(s.power_jumping),
      'power_stamina',               public._n(s.power_stamina),
      'power_strength',              public._n(s.power_strength),
      'power_long_shots',            public._n(s.power_long_shots),
      'mentality_aggression',        public._n(s.mentality_aggression),
      'mentality_interceptions',     public._n(s.mentality_interceptions),
      'mentality_positioning',       public._n(s.mentality_positioning),
      'mentality_vision',            public._n(s.mentality_vision),
      'mentality_penalties',         public._n(s.mentality_penalties),
      'mentality_composure',         public._n(s.mentality_composure),
      'defending_marking_awareness', public._n(s.defending_marking_awareness),
      'defending_standing_tackle',   public._n(s.defending_standing_tackle),
      'defending_sliding_tackle',    public._n(s.defending_sliding_tackle)
    )),
    public._n(s.value_eur)::bigint,
    public._n(s.wage_eur)::bigint,
    true
  from public.players_import s
  join public.player_identities i on i.source_id = public._n(s.sofifa_id)
  where public._n(s.overall) is not null;

  get diagnostics v_tpl = ROW_COUNT;

  select count(*) into v_gk from public.player_templates where position = 'GK';

  return query select v_ident, v_tpl, v_gk;
end;
$$;

revoke all on function public.import_players_from_staging() from public;
grant execute on function public.import_players_from_staging() to authenticated;

-- ------------------------------------------------------------
-- 5) Vista de catálogo ampliada (la usan buscador, sobres, IA, plantilla)
-- ------------------------------------------------------------
drop view if exists public.player_catalog;
create view public.player_catalog as
  select
    t.id,
    t.identity_id,
    i.source_id,
    i.name,
    i.long_name,
    i.nationality,
    i.art_portrait,
    i.dob,
    i.height_cm,
    i.weight_kg,
    i.club_name,
    i.league_name,
    i.preferred_foot,
    i.weak_foot,
    i.skill_moves,
    i.work_rate,
    i.international_reputation,
    i.player_traits,
    t.position,
    t.positions,
    t.version,
    t.rarity,
    t.overall,
    t.potential,
    t.age,
    t.personality,
    t.attributes,
    t.gk_attributes,
    t.detail,
    t.value_eur,
    t.is_tradeable
  from public.player_templates t
  join public.player_identities i on i.id = t.identity_id;

grant select on public.player_catalog to anon, authenticated;

-- ------------------------------------------------------------
-- 6) Verificación posterior a la importación
-- ------------------------------------------------------------
create or replace function public.verify_player_import()
returns TABLE(chequeo text, valor text, ok boolean)
language sql
security definer
set search_path = public
as $$
  select 'Jugadores en el CSV (staging)', count(*)::text, count(*) > 0
    from public.players_import
  union all
  select 'Identidades importadas', count(*)::text, count(*) > 0
    from public.player_identities
  union all
  select 'Plantillas (jugadores del juego)', count(*)::text, count(*) > 0
    from public.player_templates
  union all
  select 'Coinciden staging y catálogo',
         (select count(*) from public.player_templates)::text || ' / ' ||
         (select count(*) from public.players_import)::text,
         (select count(*) from public.player_templates) >=
         (select count(*) from public.players_import) - 5
  union all
  select 'Porteros con stats de portería', count(*)::text, count(*) > 0
    from public.player_templates
    where position = 'GK' and gk_attributes ? 'diving'
  union all
  select 'Sin atributos principales', count(*)::text, count(*) = 0
    from public.player_templates
    where attributes is null or not (attributes ? 'pace')
  union all
  select 'Sin overall', count(*)::text, count(*) = 0
    from public.player_templates where overall is null
  union all
  select 'Rarezas presentes',
         string_agg(distinct rarity, ', '), count(distinct rarity) >= 5
    from public.player_templates
  union all
  select 'Con club asignado', count(*)::text, count(*) > 0
    from public.player_identities where club_name is not null
  union all
  select 'Jugadores de ejemplo restantes', count(*)::text, count(*) = 0
    from public.player_identities where source_id is null;
$$;
grant execute on function public.verify_player_import() to authenticated;
