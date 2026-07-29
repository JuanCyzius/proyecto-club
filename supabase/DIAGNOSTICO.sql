-- ============================================================
-- DIAGNÓSTICO — Ejecutá TODO esto en el SQL Editor de Supabase.
-- Te dice exactamente qué migración falta.
-- ============================================================

-- 1) ¿Qué tablas existen?
select
  (to_regclass('public.profiles')          is not null) as t_profiles,
  (to_regclass('public.player_templates')  is not null) as t_jugadores,
  (to_regclass('public.player_cards')      is not null) as t_cartas,
  (to_regclass('public.squads')            is not null) as t_plantilla,
  (to_regclass('public.matches')           is not null) as t_partidos,
  (to_regclass('public.packs')             is not null) as t_sobres,
  (to_regclass('public.coin_ledger')       is not null) as t_ledger;

-- 2) ¿Cuántos datos hay? (jugadores_catalogo debe ser ~420)
select
  (select count(*) from public.profiles)                              as clubes,
  (select count(*) from public.player_identities)                     as identidades,
  (select count(*) from public.player_templates)                      as jugadores_catalogo,
  (select count(*) from public.packs)                                 as sobres,
  (select count(*) from public.ai_opponents)                          as rivales_ia,
  (select count(*) from public.player_cards)                          as cartas_repartidas;

-- 3) ¿Existen las funciones que usa el juego?
select
  (to_regprocedure('public.claim_welcome()')            is not null) as f_bienvenida,
  (to_regprocedure('public.open_pack(uuid,text)')       is not null) as f_abrir_sobre,
  (to_regprocedure('public.quick_sell(uuid)')           is not null) as f_venta_rapida,
  (to_regprocedure('public.grant_match_reward(uuid)')   is not null) as f_recompensa,
  (to_regprocedure('public.ensure_profile(text,text)')  is not null) as f_crear_perfil;

-- 4) ¿Hay usuarios sin club? (debe dar 0)
select count(*) as usuarios_sin_club
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ============================================================
-- CÓMO LEER EL RESULTADO
-- ============================================================
-- t_jugadores = false        -> falta 0002_players.sql
-- jugadores_catalogo = 0     -> falta seed_players.sql  (¡causa más común!)
-- t_cartas = false           -> falta 0003_squad.sql
-- t_partidos = false         -> falta 0004_matches.sql
-- t_sobres = false / f_bienvenida = false -> falta 0005_economy.sql
-- f_crear_perfil = false     -> falta 0006_auth_repair.sql
-- usuarios_sin_club > 0      -> ejecutá 0006_auth_repair.sql
--
-- ORDEN CORRECTO DE EJECUCIÓN:
--   0001 -> 0002 -> seed_players.sql -> 0003 -> 0004 -> 0005 -> 0006 -> 0007
