-- ============================================================
-- FASE 4 — Partidos y rivales IA
-- Los resultados los escribe SOLO el servidor (service role).
-- Los usuarios solo pueden LEER sus partidos.
-- ============================================================

-- ------------------------------------------------------------
-- Rivales IA (el plantel se muestrea de player_templates al jugar)
-- ------------------------------------------------------------
create table if not exists public.ai_opponents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  style      text not null,   -- defensive | possession | counter | high_press | offensive
  tier       text not null,   -- weak | medium | strong | elite | legendary
  rating     int  not null,   -- media objetivo del plantel
  formation  text not null default '4-3-3',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ai_opponents enable row level security;
create policy "ai_read" on public.ai_opponents for select using (true);

insert into public.ai_opponents (name, style, tier, rating, formation, sort) values
  ('Cantera FC',       'defensive',  'weak',       60, '4-4-2',   10),
  ('Río Verde',        'offensive',  'weak',       64, '4-3-3',   20),
  ('Unión Central',    'possession', 'medium',     71, '4-2-3-1', 30),
  ('Atlético Puerto',  'counter',    'medium',     74, '4-4-2',   40),
  ('Sporting Nébula',  'high_press', 'strong',     80, '4-3-3',   50),
  ('Dínamo Real',      'possession', 'strong',     82, '4-2-3-1', 60),
  ('Corona Elite',     'offensive',  'elite',      87, '4-3-3',   70),
  ('Legado Eterno',    'possession', 'legendary',  91, '4-3-3',   80)
on conflict do nothing;

-- ------------------------------------------------------------
-- Partidos
-- ------------------------------------------------------------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  home_user   uuid references public.profiles(id) on delete cascade,
  away_user   uuid references public.profiles(id) on delete cascade, -- null vs IA
  ai_opponent uuid references public.ai_opponents(id),
  kind        text not null default 'ai',        -- ai | pvp | league (fases futuras)
  competition text not null default 'friendly',  -- friendly | league | cup | ranked
  seed        text not null,
  status      text not null default 'done',
  home_name   text not null,
  away_name   text not null,
  home_score  int,
  away_score  int,
  winner      text,                              -- home | away | draw
  log         jsonb,                             -- eventos + stats + ratings + penales
  created_at  timestamptz not null default now(),
  played_at   timestamptz
);
create index if not exists idx_matches_home on public.matches (home_user, played_at desc);
create index if not exists idx_matches_away on public.matches (away_user, played_at desc);
alter table public.matches enable row level security;

-- Solo participantes pueden LEER. La escritura es del servidor (service role,
-- que ignora RLS). No hay policy de insert/update para usuarios.
create policy "matches_read_participant" on public.matches
  for select using (auth.uid() = home_user or auth.uid() = away_user);
