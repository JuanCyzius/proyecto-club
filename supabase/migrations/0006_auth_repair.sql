-- ============================================================
-- REPARACIÓN DE AUTENTICACIÓN (migración única y autosuficiente)
-- Corrige:
--   1. profiles sin columna `username` (venías del esquema viejo)
--   2. usuarios en auth.users SIN fila en profiles -> bucle /club <-> /login
--   3. trigger de creación de perfil ausente o frágil
-- Es IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla de perfiles con la forma correcta
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  club_name  text not null,
  level      int    not null default 1,
  xp         int    not null default 0,
  coins      bigint not null default 0,
  gems       int    not null default 0,
  division   int    not null default 10,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;

-- ------------------------------------------------------------
-- 2) Generador de username libre (evita choques de unicidad)
-- ------------------------------------------------------------
create or replace function public._unique_username(p_wanted text, p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_try  text;
  i      int := 0;
begin
  v_base := lower(regexp_replace(coalesce(p_wanted, ''), '[^a-z0-9_]', '', 'g'));
  v_base := substr(v_base, 1, 16);
  if length(v_base) < 3 then
    v_base := 'club' || substr(replace(p_uid::text, '-', ''), 1, 6);
  end if;

  v_try := v_base;
  while exists (select 1 from public.profiles where username = v_try) loop
    i := i + 1;
    v_try := v_base || i::text;
    if i > 999 then
      v_try := v_base || substr(replace(p_uid::text, '-', ''), 1, 4);
      exit;
    end if;
  end loop;
  return v_try;
end;
$$;

-- ------------------------------------------------------------
-- 3) Rellenar usernames vacíos de perfiles ya existentes
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.username is null or p.username = ''
  loop
    update public.profiles
      set username = public._unique_username(split_part(r.email, '@', 1), r.id)
      where id = r.id;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4) CLAVE: crear perfiles faltantes (usuarios huérfanos)
--    Esto es lo que rompe el bucle /club <-> /login
-- ------------------------------------------------------------
do $$
declare r record; v_name text; v_club text;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    v_name := coalesce(r.raw_user_meta_data ->> 'username',
                       split_part(r.email, '@', 1));
    v_club := nullif(trim(coalesce(r.raw_user_meta_data ->> 'club_name', '')), '');
    insert into public.profiles (id, username, club_name)
    values (r.id, public._unique_username(v_name, r.id), coalesce(v_club, 'Mi Club'));
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5) Sanear usernames antes de aplicar restricciones
--    (por si un intento anterior dejó valores inválidos o repetidos)
-- ------------------------------------------------------------
-- 5a) Formato inválido -> regenerar
do $$
declare r record;
begin
  for r in
    select id, username from public.profiles
    where username is null or username !~ '^[a-z0-9_]{3,20}$'
  loop
    update public.profiles
      set username = public._unique_username(coalesce(r.username, ''), r.id)
      where id = r.id;
  end loop;
end $$;

-- 5b) Duplicados -> dejar el más antiguo, renombrar el resto
do $$
declare r record;
begin
  for r in
    select id, username from (
      select id, username,
             row_number() over (partition by username order by created_at, id) as rn
      from public.profiles
    ) t where rn > 1
  loop
    update public.profiles
      set username = public._unique_username(r.username, r.id)
      where id = r.id;
  end loop;
end $$;

-- 5c) Ahora sí: índice único y restricción de formato
create unique index if not exists profiles_username_key
  on public.profiles (username);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_check') then
    alter table public.profiles
      add constraint profiles_username_check
      check (username ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;

-- ------------------------------------------------------------
-- 6) RLS y políticas
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Borrar TODAS las políticas previas de profiles y recrearlas limpias.
-- Importante: el esquema viejo tenía una política `using (true)` que dejaba
-- ver el perfil completo (¡monedas incluidas!) de cualquier usuario.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', r.policyname);
  end loop;
end $$;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- La vista pudo crearse antes SIN `username`. `create or replace view` no
-- permite cambiar las columnas, así que la recreamos desde cero.
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id, username, club_name, level, division from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ------------------------------------------------------------
-- 7) Trigger robusto: crea el perfil al registrarse.
--    Nunca aborta el alta por un username repetido.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_wanted text; v_club text;
begin
  v_wanted := coalesce(new.raw_user_meta_data ->> 'username',
                       split_part(coalesce(new.email, ''), '@', 1));
  v_club   := nullif(trim(coalesce(new.raw_user_meta_data ->> 'club_name', '')), '');

  insert into public.profiles (id, username, club_name)
  values (new.id, public._unique_username(v_wanted, new.id), coalesce(v_club, 'Mi Club'))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 8) Red de seguridad: la app puede crear su propio perfil si falta
-- ------------------------------------------------------------
create or replace function public.ensure_profile(p_club_name text, p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.profiles;
  v_club text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.profiles where id = v_user;
  if found then return v_row; end if;

  v_club := nullif(trim(coalesce(p_club_name, '')), '');
  insert into public.profiles (id, username, club_name)
  values (v_user, public._unique_username(p_username, v_user), coalesce(v_club, 'Mi Club'))
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.ensure_profile(text, text) from public;
grant execute on function public.ensure_profile(text, text) to authenticated;

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where username = lower(p_username));
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 9) Restos del sistema de invitados (si existían)
-- ------------------------------------------------------------
drop function if exists public.enforce_invited_email(jsonb);
drop function if exists public.is_email_invited(text);
drop function if exists public.create_club(text);
drop table if exists public.invited_emails;

-- ============================================================
-- COMPROBACIÓN (descomentá y ejecutá: los 3 deben dar true)
-- ============================================================
-- select
--   (select count(*) from information_schema.columns
--      where table_name='profiles' and column_name='username') = 1 as username_ok,
--   (select count(*) from pg_trigger where tgname='on_auth_user_created') = 1 as trigger_ok,
--   (select count(*) from auth.users u
--      left join public.profiles p on p.id=u.id where p.id is null) = 0 as sin_huerfanos;
