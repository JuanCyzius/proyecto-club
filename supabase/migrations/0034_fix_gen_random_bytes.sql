-- ============================================================
-- FIX: gen_random_bytes no se encontraba (pgcrypto en "extensions")
--
-- Error real: function gen_random_bytes(integer) does not exist.
--
-- Causa: Supabase instala la extensión pgcrypto en el esquema
-- "extensions", no en "public". Las funciones de este proyecto
-- fijan `set search_path = public`, así que Postgres nunca llega a
-- mirar en "extensions" y no encuentra gen_random_bytes(). Afecta a
-- cualquier función que arme un seed random en hex: sobres y ligas
-- PvP.
--
-- Arreglo en dos pasos:
-- 1. Asegurar que pgcrypto esté instalada (no rompe nada si ya
--    estaba, "if not exists" la deja como esté).
-- 2. Agregar "extensions" al search_path de las funciones afectadas,
--    sin tocar ni una línea de su lógica.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

alter function public.open_pack(uuid, text)
  set search_path = public, extensions;

alter function public.create_group_league(text)
  set search_path = public, extensions;

alter function public.find_ranked_match()
  set search_path = public, extensions;

alter function public.create_wager_match(uuid, bigint)
  set search_path = public, extensions;

-- ------------------------------------------------------------
-- Comprobación: esto ya no debería tirar "does not exist".
-- ------------------------------------------------------------
select encode(extensions.gen_random_bytes(8), 'hex') as prueba_ok;
