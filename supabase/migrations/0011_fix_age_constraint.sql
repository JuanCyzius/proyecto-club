-- ============================================================
-- FIX — "violates check constraint player_templates_age_check"
--
-- Causa: la restricción original (Fase 2) limitaba la edad a 15-45,
-- pensada para jugadores ficticios generados. El dataset real tiene
-- un caso legítimo fuera de ese rango: Kazuyoshi Miura, 54 años.
--
-- Solución: ampliar el rango a 14-60. No se altera ningún dato del
-- CSV; solo se permite que la edad real se guarde tal cual.
--
-- Ejecutar ANTES de import_players_from_staging(). Idempotente.
-- ============================================================

alter table public.player_templates
  drop constraint if exists player_templates_age_check;

alter table public.player_templates
  add constraint player_templates_age_check
  check (age between 14 and 60);

-- El potencial real llega a 95; el margen 1-99 ya lo cubre, pero
-- normalizamos por si la restricción quedó más estrecha.
alter table public.player_templates
  drop constraint if exists player_templates_overall_check;
alter table public.player_templates
  add constraint player_templates_overall_check
  check (overall between 1 and 99);

alter table public.player_templates
  drop constraint if exists player_templates_potential_check;
alter table public.player_templates
  add constraint player_templates_potential_check
  check (potential between 1 and 99);


-- ============================================================
-- COMPROBACIÓN PREVIA — ejecutá esto ANTES de importar.
-- Detecta de una sola vez cualquier fila del CSV que violaría
-- alguna restricción. Todo debe dar filas = 0.
-- ============================================================

select 'age fuera de 14-60' as problema, count(*) as filas
  from public.players_import
  where public._n(age) is not null and public._n(age) not between 14 and 60
union all
select 'age nulo', count(*) from public.players_import
  where public._n(age) is null
union all
select 'overall fuera de 1-99', count(*) from public.players_import
  where public._n(overall) is not null and public._n(overall) not between 1 and 99
union all
select 'potential fuera de 1-99', count(*) from public.players_import
  where greatest(public._n(potential), public._n(overall)) not between 1 and 99
union all
select 'nombre vacío', count(*) from public.players_import
  where nullif(trim(short_name), '') is null
union all
select 'sofifa_id inválido', count(*) from public.players_import
  where public._n(sofifa_id) is null
union all
select 'sofifa_id duplicado',
       (select count(*) from (
          select public._n(sofifa_id) sid from public.players_import
          group by 1 having count(*) > 1) d)
union all
select 'posiciones vacías', count(*) from public.players_import
  where nullif(trim(player_positions), '') is null;

-- Comprobación: deben aparecer las tres restricciones con su rango
select conname as restriccion, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.player_templates'::regclass
  and contype = 'c'
order by conname;
