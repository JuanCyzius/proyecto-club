-- ============================================================
-- FASE 2 — Jugadores y cartas (datos)
-- Modelo: identidad -> plantilla (versión). Lectura pública,
-- escritura solo servidor/seed. Vista plana para el catálogo.
-- ============================================================

-- ------------------------------------------------------------
-- Identidad ficticia del jugador
-- ------------------------------------------------------------
create table if not exists public.player_identities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  nationality  text,
  art_portrait text,                 -- ruta en Storage (null hasta la Fase 10)
  created_at   timestamptz not null default now()
);
alter table public.player_identities enable row level security;
create policy "identities_read" on public.player_identities
  for select using (true);
-- Sin policies de escritura: solo se puebla vía seed (rol postgres) o servidor.

-- ------------------------------------------------------------
-- Plantilla = una versión de una identidad (base/especial/icono)
-- ------------------------------------------------------------
create table if not exists public.player_templates (
  id           uuid primary key default gen_random_uuid(),
  identity_id  uuid not null references public.player_identities(id) on delete cascade,
  position     text not null,
  version      text not null default 'base',
  rarity       text not null,
  overall      int  not null check (overall between 1 and 99),
  potential    int  not null check (potential between 1 and 99),
  age          int  not null check (age between 14 and 60),   -- datos reales: hay activos de 54
  personality  text not null default 'balanced',
  attributes   jsonb not null,       -- {pace,shooting,passing,defending,physical,dribbling}
  is_tradeable boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.player_templates enable row level security;
create policy "templates_read" on public.player_templates
  for select using (true);

create index if not exists idx_templates_position_overall
  on public.player_templates (position, overall desc);
create index if not exists idx_templates_rarity
  on public.player_templates (rarity);
create index if not exists idx_templates_overall
  on public.player_templates (overall desc);

-- ------------------------------------------------------------
-- Vista plana para el catálogo (join identidad + plantilla)
-- ------------------------------------------------------------
create or replace view public.player_catalog as
  select
    t.id,
    t.identity_id,
    i.name,
    i.nationality,
    i.art_portrait,
    t.position,
    t.version,
    t.rarity,
    t.overall,
    t.potential,
    t.age,
    t.personality,
    t.attributes,
    t.is_tradeable
  from public.player_templates t
  join public.player_identities i on i.id = t.identity_id;

grant select on public.player_catalog to anon, authenticated;
