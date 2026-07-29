-- ============================================================
-- PARTIDOS INTERACTIVOS (en vivo, por tramos)
--
-- El estado completo del partido vive en el servidor. El cliente solo
-- pide "avanzá" o "aplicá esta decisión"; nunca ve el estado interno
-- ni puede alterar el marcador.
--
-- IMPORTANTE: no se añaden políticas de escritura para usuarios.
-- Todas las escrituras de `matches` las hace el servidor con la clave
-- secreta (service role), igual que antes. La RLS sigue permitiendo
-- únicamente LECTURA a los participantes.
-- ============================================================

alter table public.matches
  add column if not exists live_state jsonb,     -- estado serializado del motor
  add column if not exists is_live    boolean not null default false;

create index if not exists idx_matches_live
  on public.matches (home_user, is_live) where is_live;

-- Limpieza defensiva: si alguna versión previa creó políticas de
-- escritura para usuarios, se eliminan (romperían la autoridad del servidor).
drop policy if exists "matches_update_own_live" on public.matches;
drop policy if exists "matches_insert_own" on public.matches;
