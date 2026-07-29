-- ============================================================
-- FASE 1 — Fundaciones (registro abierto por usuario/contraseña)
-- Auth: email+password de Supabase con email sintético usuario@club.local.
-- El perfil se crea solo vía trigger al registrarse.
-- ============================================================
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Perfil = club del usuario
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique
             check (username ~ '^[a-z0-9_]{3,20}$'),
  club_name  text not null,
  level      int    not null default 1,
  xp         int    not null default 0,
  coins      bigint not null default 0,
  gems       int    not null default 0,
  division   int    not null default 10,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- El dueño puede leer y actualizar SU perfil completo.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No hay policy de INSERT: el perfil solo lo crea el trigger (SECURITY DEFINER).

-- ------------------------------------------------------------
-- Vista pública con básicos (para futuras listas de liga).
-- Expone username/club_name/level/division; nunca monedas.
-- ------------------------------------------------------------
create or replace view public.public_profiles as
  select id, username, club_name, level, division
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ------------------------------------------------------------
-- Trigger: al crearse el usuario en auth.users, se crea su perfil
-- usando los metadatos enviados en el signUp (username, club_name).
-- Si el username está repetido o es inválido, la inserción falla y
-- el registro completo se revierte (no quedan usuarios huérfanos).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, club_name)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'club_name'), ''), 'Mi Club')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- RPC (opcional, para UX): ¿el username está libre? (pre-registro)
-- ------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where username = lower(p_username)
  );
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
