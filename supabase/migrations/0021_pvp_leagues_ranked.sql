-- ============================================================
-- FASE 7 — PvP, LIGAS Y RANKED
--
-- · Liga del grupo: todos contra todos, ida y vuelta.
-- · Ranked asíncrono: emparejamiento por rating, ascensos/descensos.
-- · Amistosos con apuesta de monedas (escrow atómico).
-- · Todos los partidos PvP se simulan en el servidor recargando las
--   plantillas reales de ambos: el cliente nunca aporta datos de juego.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Temporadas y competiciones
-- ------------------------------------------------------------
create table if not exists public.seasons (
  id        uuid primary key default gen_random_uuid(),
  number    int not null,
  name      text not null,
  starts_at timestamptz not null default now(),
  ends_at   timestamptz,
  status    text not null default 'active'   -- upcoming | active | ended
);
alter table public.seasons enable row level security;
drop policy if exists "seasons_read" on public.seasons;
create policy "seasons_read" on public.seasons for select using (true);

create table if not exists public.competitions (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid references public.seasons(id) on delete cascade,
  type       text not null,                 -- league | cup | ranked | friendly
  name       text not null,
  config     jsonb not null default '{}',
  status     text not null default 'active',-- pending | active | ended
  created_at timestamptz not null default now()
);
alter table public.competitions enable row level security;
drop policy if exists "competitions_read" on public.competitions;
create policy "competitions_read" on public.competitions for select using (true);

-- ------------------------------------------------------------
-- 2) Clasificación
-- ------------------------------------------------------------
create table if not exists public.standings (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  played int not null default 0,
  won    int not null default 0,
  drawn  int not null default 0,
  lost   int not null default 0,
  gf     int not null default 0,
  ga     int not null default 0,
  points int not null default 0,
  primary key (competition_id, user_id)
);
create index if not exists idx_standings_comp
  on public.standings (competition_id, points desc, (gf - ga) desc);
alter table public.standings enable row level security;
drop policy if exists "standings_read" on public.standings;
create policy "standings_read" on public.standings for select using (true);

-- ------------------------------------------------------------
-- 3) Ampliar `matches` para PvP
-- ------------------------------------------------------------
alter table public.matches
  add column if not exists competition_id uuid references public.competitions(id) on delete set null,
  add column if not exists round          int,
  add column if not exists stake          bigint not null default 0,
  add column if not exists settled        boolean not null default false;

create index if not exists idx_matches_comp
  on public.matches (competition_id, round);
create index if not exists idx_matches_pending
  on public.matches (status) where status = 'pending';

-- Los partidos PvP deben ser visibles para ambos participantes.
-- (La política existente ya cubre home_user / away_user.)

-- ------------------------------------------------------------
-- 4) Perfil: rating ranked
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists rating          int not null default 1000,
  add column if not exists ranked_played   int not null default 0,
  add column if not exists ranked_won      int not null default 0;

-- La vista pública muestra rating y división (para el ranking)
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id, username, club_name, level, division, rating,
         ranked_played, ranked_won
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ------------------------------------------------------------
-- 5) Liga del grupo: crear competición y calendario round-robin
-- ------------------------------------------------------------
create or replace function public.create_group_league(p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_season uuid; v_comp uuid; v_users uuid[]; v_n int;
  i int; j int; r int; v_home uuid; v_away uuid; v_rounds int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select array_agg(id order by created_at) into v_users from public.profiles;
  v_n := coalesce(array_length(v_users, 1), 0);
  if v_n < 2 then raise exception 'hacen falta al menos 2 clubes'; end if;

  -- Temporada activa (se crea si no hay)
  select id into v_season from public.seasons where status = 'active' limit 1;
  if v_season is null then
    insert into public.seasons (number, name)
    values (1, 'Temporada 1') returning id into v_season;
  end if;

  insert into public.competitions (season_id, type, name, config)
  values (v_season, 'league',
          coalesce(p_name, 'Liga del grupo'),
          jsonb_build_object('teams', v_n, 'double_round', true))
  returning id into v_comp;

  -- Todos empiezan con la tabla en cero
  insert into public.standings (competition_id, user_id)
  select v_comp, u from unnest(v_users) u;

  -- Calendario: todos contra todos, ida y vuelta
  r := 1;
  for i in 1..v_n loop
    for j in 1..v_n loop
      if i < j then
        v_home := v_users[i]; v_away := v_users[j];
        insert into public.matches
          (home_user, away_user, kind, competition, competition_id, round,
           seed, status, home_name, away_name)
        values
          (v_home, v_away, 'pvp', 'league', v_comp, r,
           encode(gen_random_bytes(8), 'hex'), 'pending',
           (select club_name from public.profiles where id = v_home),
           (select club_name from public.profiles where id = v_away));
        -- Vuelta
        insert into public.matches
          (home_user, away_user, kind, competition, competition_id, round,
           seed, status, home_name, away_name)
        values
          (v_away, v_home, 'pvp', 'league', v_comp, r + 100,
           encode(gen_random_bytes(8), 'hex'), 'pending',
           (select club_name from public.profiles where id = v_away),
           (select club_name from public.profiles where id = v_home));
        r := r + 1;
      end if;
    end loop;
  end loop;

  return v_comp;
end; $$;
revoke all on function public.create_group_league(text) from public;
grant execute on function public.create_group_league(text) to authenticated;

-- ------------------------------------------------------------
-- 6) Actualizar la tabla tras un partido (uso interno del servidor)
-- ------------------------------------------------------------
create or replace function public.apply_standings(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.competition_id is null then return; end if;
  if m.settled then return; end if;          -- idempotente
  if m.status <> 'done' then return; end if;

  -- Local
  insert into public.standings (competition_id, user_id) values (m.competition_id, m.home_user)
    on conflict do nothing;
  update public.standings set
    played = played + 1,
    won    = won   + case when m.winner = 'home' then 1 else 0 end,
    drawn  = drawn + case when m.winner = 'draw' then 1 else 0 end,
    lost   = lost  + case when m.winner = 'away' then 1 else 0 end,
    gf     = gf + coalesce(m.home_score, 0),
    ga     = ga + coalesce(m.away_score, 0),
    points = points + case when m.winner = 'home' then 3
                           when m.winner = 'draw' then 1 else 0 end
    where competition_id = m.competition_id and user_id = m.home_user;

  -- Visitante (solo si es PvP)
  if m.away_user is not null then
    insert into public.standings (competition_id, user_id) values (m.competition_id, m.away_user)
      on conflict do nothing;
    update public.standings set
      played = played + 1,
      won    = won   + case when m.winner = 'away' then 1 else 0 end,
      drawn  = drawn + case when m.winner = 'draw' then 1 else 0 end,
      lost   = lost  + case when m.winner = 'home' then 1 else 0 end,
      gf     = gf + coalesce(m.away_score, 0),
      ga     = ga + coalesce(m.home_score, 0),
      points = points + case when m.winner = 'away' then 3
                             when m.winner = 'draw' then 1 else 0 end
      where competition_id = m.competition_id and user_id = m.away_user;
  end if;

  update public.matches set settled = true where id = p_match_id;
end; $$;
revoke all on function public.apply_standings(uuid) from public;
grant execute on function public.apply_standings(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7) Ranked: emparejar por rating
-- ------------------------------------------------------------
create or replace function public.find_ranked_match()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rating int; v_opp uuid; v_id uuid; v_band int := 120;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Debe tener once completo
  if (select count(*) from public.squad_slots
      where user_id = v_user and card_id is not null
        and slot not like 'SUB%') < 11 then
    raise exception 'completá tu once antes de buscar partido';
  end if;

  select rating into v_rating from public.profiles where id = v_user;

  -- Rival con once armado y rating parecido; se ensancha la banda
  while v_opp is null and v_band <= 2000 loop
    select p.id into v_opp
    from public.profiles p
    where p.id <> v_user
      and abs(p.rating - v_rating) <= v_band
      and (select count(*) from public.squad_slots s
           where s.user_id = p.id and s.card_id is not null
             and s.slot not like 'SUB%') >= 11
    order by random()
    limit 1;
    v_band := v_band * 2;
  end loop;

  if v_opp is null then
    raise exception 'no hay rivales disponibles con el once armado';
  end if;

  insert into public.matches
    (home_user, away_user, kind, competition, seed, status, home_name, away_name)
  values
    (v_user, v_opp, 'pvp', 'ranked', encode(gen_random_bytes(8), 'hex'), 'pending',
     (select club_name from public.profiles where id = v_user),
     (select club_name from public.profiles where id = v_opp))
  returning id into v_id;

  return v_id;
end; $$;
revoke all on function public.find_ranked_match() from public;
grant execute on function public.find_ranked_match() to authenticated;

-- ------------------------------------------------------------
-- 8) Ajuste de rating tipo Elo + división
-- ------------------------------------------------------------
create or replace function public.apply_ranked_result(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; rh int; ra int; eh numeric; ea numeric;
  sh numeric; sa numeric; k int := 32; nh int; na int;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then return; end if;
  if m.competition <> 'ranked' or m.away_user is null then return; end if;
  if m.settled then return; end if;
  if m.status <> 'done' then return; end if;

  select rating into rh from public.profiles where id = m.home_user;
  select rating into ra from public.profiles where id = m.away_user;

  eh := 1.0 / (1.0 + power(10, (ra - rh) / 400.0));
  ea := 1.0 - eh;
  sh := case when m.winner = 'home' then 1 when m.winner = 'draw' then 0.5 else 0 end;
  sa := 1 - sh;

  nh := greatest(100, rh + round(k * (sh - eh))::int);
  na := greatest(100, ra + round(k * (sa - ea))::int);

  update public.profiles set
    rating = nh,
    ranked_played = ranked_played + 1,
    ranked_won = ranked_won + case when m.winner = 'home' then 1 else 0 end,
    -- División 10 (más baja) a 1 (más alta), según el rating
    division = greatest(1, least(10, 10 - floor((nh - 800) / 150)::int))
    where id = m.home_user;

  update public.profiles set
    rating = na,
    ranked_played = ranked_played + 1,
    ranked_won = ranked_won + case when m.winner = 'away' then 1 else 0 end,
    division = greatest(1, least(10, 10 - floor((na - 800) / 150)::int))
    where id = m.away_user;

  update public.matches set settled = true where id = p_match_id;
end; $$;
revoke all on function public.apply_ranked_result(uuid) from public;
grant execute on function public.apply_ranked_result(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9) Amistoso con apuesta: escrow atómico
-- ------------------------------------------------------------
create or replace function public.create_wager_match(p_opponent uuid, p_stake bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_id uuid; v_coins bigint; v_opp_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_opponent = v_user then raise exception 'no podés apostar contra vos mismo'; end if;
  if p_stake < 100 then raise exception 'la apuesta mínima es 100'; end if;
  if p_stake > 100000 then raise exception 'la apuesta máxima es 100.000'; end if;

  if not exists (select 1 from public.profiles where id = p_opponent) then
    raise exception 'rival no encontrado';
  end if;

  -- Ambos necesitan once completo
  if (select count(*) from public.squad_slots
      where user_id = v_user and card_id is not null and slot not like 'SUB%') < 11 then
    raise exception 'completá tu once antes de apostar';
  end if;
  if (select count(*) from public.squad_slots
      where user_id = p_opponent and card_id is not null and slot not like 'SUB%') < 11 then
    raise exception 'tu rival todavía no tiene el once armado';
  end if;

  -- Retener el dinero de ambos (escrow)
  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < p_stake then raise exception 'insufficient funds'; end if;
  select coins into v_opp_coins from public.profiles where id = p_opponent for update;
  if v_opp_coins < p_stake then raise exception 'tu rival no tiene saldo suficiente'; end if;

  update public.profiles set coins = coins - p_stake where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -p_stake, 'wager_hold', 'pending', v_coins - p_stake);

  update public.profiles set coins = coins - p_stake where id = p_opponent;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (p_opponent, -p_stake, 'wager_hold', 'pending', v_opp_coins - p_stake);

  insert into public.matches
    (home_user, away_user, kind, competition, seed, status,
     home_name, away_name, stake)
  values
    (v_user, p_opponent, 'pvp', 'friendly', encode(gen_random_bytes(8), 'hex'), 'pending',
     (select club_name from public.profiles where id = v_user),
     (select club_name from public.profiles where id = p_opponent),
     p_stake)
  returning id into v_id;

  -- Dejar la referencia del ledger apuntando al partido
  update public.coin_ledger set ref = v_id::text
    where reason = 'wager_hold' and ref = 'pending'
      and user_id in (v_user, p_opponent);

  return v_id;
end; $$;
revoke all on function public.create_wager_match(uuid, bigint) from public;
grant execute on function public.create_wager_match(uuid, bigint) to authenticated;

-- ------------------------------------------------------------
-- 10) Pagar la apuesta al terminar
--     Bote = 2 × stake. Comisión del 5% (sumidero). Empate: se
--     devuelve lo apostado a cada uno, sin comisión.
-- ------------------------------------------------------------
create or replace function public.settle_wager(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m record; v_pot bigint; v_fee bigint; v_net bigint;
  v_winner uuid; v_coins bigint;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if m.stake <= 0 then return jsonb_build_object('stake', 0); end if;
  if m.status <> 'done' then return jsonb_build_object('pending', true); end if;

  -- Idempotencia: una apuesta se paga una sola vez
  if exists (
    select 1 from public.coin_ledger
    where reason in ('wager_win', 'wager_refund') and ref = p_match_id::text
  ) then
    return jsonb_build_object('already', true);
  end if;

  v_pot := m.stake * 2;

  if m.winner = 'draw' then
    -- Devolver a cada uno lo suyo
    select coins into v_coins from public.profiles where id = m.home_user for update;
    update public.profiles set coins = coins + m.stake where id = m.home_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (m.home_user, m.stake, 'wager_refund', p_match_id::text, v_coins + m.stake);

    select coins into v_coins from public.profiles where id = m.away_user for update;
    update public.profiles set coins = coins + m.stake where id = m.away_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (m.away_user, m.stake, 'wager_refund', p_match_id::text, v_coins + m.stake);

    return jsonb_build_object('draw', true, 'refund', m.stake);
  end if;

  v_winner := case when m.winner = 'home' then m.home_user else m.away_user end;
  v_fee := greatest(1, (v_pot * 0.05)::bigint);
  v_net := v_pot - v_fee;

  select coins into v_coins from public.profiles where id = v_winner for update;
  update public.profiles set coins = coins + v_net where id = v_winner;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_winner, v_net, 'wager_win', p_match_id::text, v_coins + v_net);

  return jsonb_build_object('winner', v_winner, 'pot', v_pot, 'fee', v_fee, 'net', v_net);
end; $$;
revoke all on function public.settle_wager(uuid) from public;
grant execute on function public.settle_wager(uuid) to authenticated;

-- ------------------------------------------------------------
-- 11) Partidos pendientes del usuario
-- ------------------------------------------------------------
create or replace function public.my_pending_matches()
returns TABLE(
  "id" uuid, "competition" text, "home_user" uuid, "away_user" uuid,
  "home_name" text, "away_name" text, "stake" bigint, "round" int,
  "competition_id" uuid, "created_at" timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.competition, m.home_user, m.away_user,
         m.home_name, m.away_name, m.stake, m.round,
         m.competition_id, m.created_at
  from public.matches m
  where m.status = 'pending'
    and (m.home_user = auth.uid() or m.away_user = auth.uid())
  order by m.created_at
  limit 50;
$$;
grant execute on function public.my_pending_matches() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.seasons)      as temporadas,
  (select count(*) from public.competitions) as competiciones,
  (select count(*) from public.profiles)     as clubes,
  (select count(*) from public.matches where status = 'pending') as partidos_pendientes;
