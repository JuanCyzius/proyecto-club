-- ============================================================
-- FASE 3 — Plantilla, formación y táctica
-- Instancias de carta por usuario + plantilla + slots.
-- ============================================================

-- ------------------------------------------------------------
-- Cartas (instancias que posee un usuario)
-- ------------------------------------------------------------
create table if not exists public.player_cards (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.player_templates(id),
  owner_id     uuid references public.profiles(id) on delete cascade,
  status       text not null default 'in_club',   -- in_club | on_market | fodder
  bound        boolean not null default false,     -- vinculada (untradeable)
  form         int not null default 5,
  morale       int not null default 5,
  stamina      int not null default 100,
  injury_until timestamptz,
  acquired_at  timestamptz not null default now()
);
create index if not exists idx_cards_owner_status
  on public.player_cards (owner_id, status);
alter table public.player_cards enable row level security;

-- El dueño ve sus cartas. La escritura (crear/mover) es solo del servidor:
-- las cartas se generan por RPC (dev/sobres) y se colocan vía squad_slots.
create policy "cards_select_own" on public.player_cards
  for select using (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- Plantilla (formación + táctica) por usuario
-- ------------------------------------------------------------
create table if not exists public.squads (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  formation  text not null default '4-3-3',
  tactics    jsonb not null default
    '{"mentality":"balanced","press":"medium","tempo":"medium","width":"medium","passing":"mixed"}',
  updated_at timestamptz not null default now()
);
alter table public.squads enable row level security;
create policy "squads_own" on public.squads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Slots (titulares SUBn/reserva): slot -> carta
-- ------------------------------------------------------------
create table if not exists public.squad_slots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot    text not null,
  card_id uuid references public.player_cards(id) on delete cascade,
  primary key (user_id, slot)
);
alter table public.squad_slots enable row level security;
create policy "slots_own" on public.squad_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- RPC (DEV): reparte ~27 cartas iniciales al usuario si no tiene ninguna.
-- Se reemplaza por el "sobre de bienvenida" en la Fase 5.
-- ------------------------------------------------------------
create or replace function public.dev_grant_starter_cards()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if; -- ya tiene cartas, no duplicar

  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from public.player_templates t where t.position = 'GK'
       order by random() limit 3)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CB','RB','LB') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CDM','CM','CAM','RM','LM') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('RW','LW','ST') order by random() limit 6)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  return v_count;
end;
$$;
revoke all on function public.dev_grant_starter_cards() from public;
grant execute on function public.dev_grant_starter_cards() to authenticated;
