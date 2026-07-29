-- ============================================================
-- FASE 8 (parte 1) — OBJETIVOS, PROGRESO Y LOGROS
--
-- El progreso se calcula LEYENDO los hechos ya registrados
-- (coin_ledger, matches, player_cards...). Así no hace falta tocar
-- las RPC existentes ni mantener contadores que se puedan desincronizar:
-- el progreso siempre refleja la realidad de la base.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Catálogo de objetivos
-- ------------------------------------------------------------
create table if not exists public.objectives (
  code         text primary key,
  scope        text not null,          -- daily | weekly | season
  name         text not null,
  description  text not null,
  metric       text not null,          -- ver _objective_progress()
  target       int  not null,
  rewards      jsonb not null,         -- {coins, xp, items:{code:qty}}
  sort         int not null default 0,
  active       boolean not null default true
);
alter table public.objectives enable row level security;
drop policy if exists "objectives_read" on public.objectives;
create policy "objectives_read" on public.objectives for select using (active);

-- ------------------------------------------------------------
-- 2) Reclamos del usuario (idempotencia por ventana temporal)
-- ------------------------------------------------------------
create table if not exists public.user_objectives (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  objective_code text not null references public.objectives(code) on delete cascade,
  period_key    text not null,          -- '2026-07-27' | '2026-W30' | 'S1'
  claimed_at    timestamptz not null default now(),
  primary key (user_id, objective_code, period_key)
);
alter table public.user_objectives enable row level security;
drop policy if exists "user_objectives_own" on public.user_objectives;
create policy "user_objectives_own" on public.user_objectives
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3) Racha de ingreso diario
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists last_daily   date,
  add column if not exists daily_streak int not null default 0;

-- ------------------------------------------------------------
-- 4) Logros permanentes
-- ------------------------------------------------------------
create table if not exists public.achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  metric      text not null,
  target      int not null,
  rewards     jsonb not null default '{}',
  sort        int not null default 0
);
alter table public.achievements enable row level security;
drop policy if exists "achievements_read" on public.achievements;
create policy "achievements_read" on public.achievements for select using (true);

create table if not exists public.user_achievements (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  achievement_code text not null references public.achievements(code) on delete cascade,
  claimed_at   timestamptz not null default now(),
  primary key (user_id, achievement_code)
);
alter table public.user_achievements enable row level security;
drop policy if exists "user_achievements_own" on public.user_achievements;
create policy "user_achievements_own" on public.user_achievements
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) Clave de periodo según el alcance
-- ------------------------------------------------------------
create or replace function public._period_key(p_scope text)
returns text language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'daily'  then to_char(now(), 'YYYY-MM-DD')
    when 'weekly' then to_char(now(), 'IYYY-"W"IW')
    else coalesce(
      (select 'S' || s.number::text from public.seasons s where s.status = 'active' limit 1),
      'S1')
  end;
$$;

-- Inicio de la ventana temporal de un alcance
create or replace function public._period_start(p_scope text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'daily'  then date_trunc('day', now())
    when 'weekly' then date_trunc('week', now())
    else coalesce(
      (select s.starts_at from public.seasons s where s.status = 'active' limit 1),
      date_trunc('month', now()))
  end;
$$;

-- ------------------------------------------------------------
-- 6) Motor de progreso: cuenta hechos reales
-- ------------------------------------------------------------
create or replace function public._objective_progress(
  p_user uuid, p_metric text, p_since timestamptz
)
returns int language plpgsql stable security definer set search_path = public as $$
declare v int := 0;
begin
  case p_metric

    when 'matches_played' then
      select count(*) into v from public.matches
        where home_user = p_user and status = 'done' and played_at >= p_since;

    when 'matches_won' then
      select count(*) into v from public.matches
        where home_user = p_user and status = 'done'
          and winner = 'home' and played_at >= p_since;

    when 'goals_scored' then
      select coalesce(sum(home_score), 0) into v from public.matches
        where home_user = p_user and status = 'done' and played_at >= p_since;

    when 'clean_sheets' then
      select count(*) into v from public.matches
        where home_user = p_user and status = 'done'
          and coalesce(away_score, 1) = 0 and played_at >= p_since;

    when 'packs_opened' then
      select count(*) into v from public.pack_openings
        where user_id = p_user and created_at >= p_since;

    when 'coins_earned' then
      select coalesce(sum(delta), 0) into v from public.coin_ledger
        where user_id = p_user and delta > 0 and created_at >= p_since;

    when 'cards_sold' then
      select count(*) into v from public.coin_ledger
        where user_id = p_user and reason in ('quick_sell', 'market_sale')
          and created_at >= p_since;

    when 'market_buys' then
      select count(*) into v from public.market_transactions
        where buyer_id = p_user and created_at >= p_since;

    when 'pvp_played' then
      select count(*) into v from public.matches
        where kind = 'pvp' and status = 'done'
          and (home_user = p_user or away_user = p_user)
          and played_at >= p_since;

    when 'pvp_won' then
      select count(*) into v from public.matches
        where kind = 'pvp' and status = 'done' and played_at >= p_since
          and ((home_user = p_user and winner = 'home')
            or (away_user = p_user and winner = 'away'));

    -- Métricas acumuladas (logros): ignoran la ventana temporal
    when 'total_cards' then
      select count(*) into v from public.player_cards where owner_id = p_user;

    when 'best_overall' then
      select coalesce(max(t.overall), 0) into v
        from public.player_cards c
        join public.player_templates t on t.id = c.template_id
        where c.owner_id = p_user;

    when 'total_matches' then
      select count(*) into v from public.matches
        where (home_user = p_user or away_user = p_user) and status = 'done';

    when 'total_wins' then
      select count(*) into v from public.matches
        where status = 'done'
          and ((home_user = p_user and winner = 'home')
            or (away_user = p_user and winner = 'away'));

    when 'club_level' then
      select level into v from public.profiles where id = p_user;

    when 'daily_streak' then
      select daily_streak into v from public.profiles where id = p_user;

    else v := 0;
  end case;

  return coalesce(v, 0);
end; $$;

-- ------------------------------------------------------------
-- 7) Listado de objetivos con progreso y estado
-- ------------------------------------------------------------
create or replace function public.my_objectives()
returns TABLE(
  "code" text, "scope" text, "name" text, "description" text,
  "target" int, "progress" int, "rewards" jsonb,
  "completed" boolean, "claimed" boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  return query
  select o.code, o.scope, o.name, o.description, o.target,
         least(p.val, o.target) as progress,
         o.rewards,
         p.val >= o.target as completed,
         exists (
           select 1 from public.user_objectives uo
           where uo.user_id = v_user and uo.objective_code = o.code
             and uo.period_key = public._period_key(o.scope)
         ) as claimed
  from public.objectives o
  cross join lateral (
    select public._objective_progress(
      v_user, o.metric, public._period_start(o.scope)
    ) as val
  ) p
  where o.active
  order by o.scope, o.sort;
end; $$;
grant execute on function public.my_objectives() to authenticated;

-- ------------------------------------------------------------
-- 8) Entregar recompensas (uso interno)
-- ------------------------------------------------------------
create or replace function public._grant_rewards(
  p_user uuid, p_rewards jsonb, p_reason text, p_ref text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_coins bigint; v_add bigint; v_xp int; v_code text; v_qty int;
  v_level int; v_new_level int;
begin
  v_add := coalesce((p_rewards->>'coins')::bigint, 0);
  if v_add > 0 then
    select coins into v_coins from public.profiles where id = p_user for update;
    update public.profiles set coins = coins + v_add where id = p_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (p_user, v_add, p_reason, p_ref, v_coins + v_add);
  end if;

  v_xp := coalesce((p_rewards->>'xp')::int, 0);
  if v_xp > 0 then
    update public.profiles set xp = xp + v_xp where id = p_user;
    -- Subida de nivel: 500 XP por nivel
    select level, xp into v_level, v_xp from public.profiles where id = p_user;
    v_new_level := greatest(1, 1 + (v_xp / 500));
    if v_new_level <> v_level then
      update public.profiles set level = v_new_level where id = p_user;
    end if;
  end if;

  if p_rewards ? 'items' then
    for v_code, v_qty in
      select key, value::int from jsonb_each_text(p_rewards->'items')
    loop
      insert into public.user_items(user_id, item_code, qty)
        values (p_user, v_code, v_qty)
        on conflict (user_id, item_code)
        do update set qty = public.user_items.qty + v_qty;
    end loop;
  end if;
end; $$;

-- ------------------------------------------------------------
-- 9) Reclamar objetivo (atómico e idempotente)
-- ------------------------------------------------------------
create or replace function public.claim_objective(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); o record; v_progress int; v_key text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into o from public.objectives where code = p_code and active;
  if not found then raise exception 'objetivo no encontrado'; end if;

  v_key := public._period_key(o.scope);

  -- La clave primaria garantiza que no se reclame dos veces
  if exists (
    select 1 from public.user_objectives
    where user_id = v_user and objective_code = p_code and period_key = v_key
  ) then
    raise exception 'ya reclamaste ese objetivo';
  end if;

  v_progress := public._objective_progress(
    v_user, o.metric, public._period_start(o.scope)
  );
  if v_progress < o.target then
    raise exception 'todavía no completaste ese objetivo (% de %)', v_progress, o.target;
  end if;

  insert into public.user_objectives(user_id, objective_code, period_key)
    values (v_user, p_code, v_key);

  perform public._grant_rewards(v_user, o.rewards, 'objective', p_code || ':' || v_key);

  return o.rewards;
end; $$;
revoke all on function public.claim_objective(text) from public;
grant execute on function public.claim_objective(text) to authenticated;

-- ------------------------------------------------------------
-- 10) Recompensa diaria con racha
-- ------------------------------------------------------------
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_last date; v_streak int; v_coins bigint; v_reward bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select last_daily, daily_streak into v_last, v_streak
    from public.profiles where id = v_user for update;

  if v_last = current_date then
    raise exception 'ya reclamaste la recompensa de hoy';
  end if;

  -- Racha: continúa si el último reclamo fue ayer; si no, se reinicia
  if v_last = current_date - 1 then
    v_streak := least(v_streak + 1, 7);
  else
    v_streak := 1;
  end if;

  -- 120, 160, 200... hasta 360 al séptimo día
  v_reward := 80 + v_streak * 40;

  select coins into v_coins from public.profiles where id = v_user;
  update public.profiles
    set coins = coins + v_reward,
        last_daily = current_date,
        daily_streak = v_streak,
        xp = xp + 25
    where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_reward, 'daily_reward', current_date::text, v_coins + v_reward);

  return jsonb_build_object('coins', v_reward, 'streak', v_streak);
end; $$;
revoke all on function public.claim_daily() from public;
grant execute on function public.claim_daily() to authenticated;

-- ------------------------------------------------------------
-- 11) Logros
-- ------------------------------------------------------------
create or replace function public.my_achievements()
returns TABLE(
  "code" text, "name" text, "description" text,
  "target" int, "progress" int, "rewards" jsonb,
  "completed" boolean, "claimed" boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  return query
  select a.code, a.name, a.description, a.target,
         least(p.val, a.target), a.rewards,
         p.val >= a.target,
         exists (select 1 from public.user_achievements ua
                 where ua.user_id = v_user and ua.achievement_code = a.code)
  from public.achievements a
  cross join lateral (
    select public._objective_progress(v_user, a.metric, '1970-01-01'::timestamptz) as val
  ) p
  order by a.sort;
end; $$;
grant execute on function public.my_achievements() to authenticated;

create or replace function public.claim_achievement(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); a record; v_progress int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into a from public.achievements where code = p_code;
  if not found then raise exception 'logro no encontrado'; end if;

  if exists (select 1 from public.user_achievements
             where user_id = v_user and achievement_code = p_code) then
    raise exception 'ya reclamaste ese logro';
  end if;

  v_progress := public._objective_progress(v_user, a.metric, '1970-01-01'::timestamptz);
  if v_progress < a.target then
    raise exception 'todavía no lo completaste (% de %)', v_progress, a.target;
  end if;

  insert into public.user_achievements(user_id, achievement_code) values (v_user, p_code);
  perform public._grant_rewards(v_user, a.rewards, 'achievement', p_code);
  return a.rewards;
end; $$;
revoke all on function public.claim_achievement(text) from public;
grant execute on function public.claim_achievement(text) to authenticated;

-- ------------------------------------------------------------
-- 12) Contenido inicial
-- ------------------------------------------------------------
delete from public.objectives;
insert into public.objectives (code, scope, name, description, metric, target, rewards, sort) values
  -- Diarias
  -- Recompensas calibradas para que la progresión sea un COMPLEMENTO
  -- (~35% del ingreso), no la fuente principal: jugar partidos manda.
  ('d_play3',  'daily', 'Rodaje',        'Jugá 3 partidos hoy.',              'matches_played', 3, '{"coins": 80, "xp": 50}', 10),
  ('d_win2',   'daily', 'Buen día',      'Ganá 2 partidos hoy.',              'matches_won',    2, '{"coins": 130, "xp": 75}', 20),
  ('d_goals5', 'daily', 'Artillería',    'Marcá 5 goles hoy.',                'goals_scored',   5, '{"coins": 90, "xp": 60}', 30),
  -- Semanales
  ('w_play15', 'weekly', 'Temporada corta', 'Jugá 15 partidos esta semana.',  'matches_played', 15, '{"coins": 400, "xp": 250, "items": {"stam_20": 2}}', 10),
  ('w_win8',   'weekly', 'Racha ganadora',  'Ganá 8 partidos esta semana.',   'matches_won',     8, '{"coins": 600, "xp": 350, "items": {"heal_2": 1}}', 20),
  ('w_clean3', 'weekly', 'Muro',            'Cerrá 3 partidos sin recibir gol.', 'clean_sheets', 3, '{"coins": 450, "xp": 300}', 30),
  ('w_packs3', 'weekly', 'Coleccionista',   'Abrí 3 sobres esta semana.',     'packs_opened',    3, '{"coins": 300, "xp": 200}', 40),
  ('w_pvp5',   'weekly', 'Cara a cara',     'Jugá 5 partidos PvP.',           'pvp_played',      5, '{"coins": 500, "xp": 300}', 50),
  -- Temporada (premios grandes, pero de una sola vez)
  ('s_play60', 'season', 'Fondo físico',   'Jugá 60 partidos en la temporada.', 'matches_played', 60, '{"coins": 8000, "xp": 1200}', 10),
  ('s_win30',  'season', 'Campeón',        'Ganá 30 partidos en la temporada.', 'matches_won',    30, '{"coins": 12000, "xp": 2000, "items": {"heal_3": 2}}', 20),
  ('s_pvp20',  'season', 'Rey del grupo',  'Ganá 20 partidos PvP.',             'pvp_won',        20, '{"coins": 15000, "xp": 2500}', 30);

delete from public.achievements;
insert into public.achievements (code, name, description, metric, target, rewards, sort) values
  ('a_cards25',  'Plantel armado',   'Tené 25 jugadores.',            'total_cards',  25, '{"coins": 2000, "xp": 200}', 10),
  ('a_cards60',  'Cantera llena',    'Tené 60 jugadores.',            'total_cards',  60, '{"coins": 6000, "xp": 500}', 20),
  ('a_star85',   'Estrella',         'Conseguí un jugador de 85+.',   'best_overall', 85, '{"coins": 8000, "xp": 600}', 30),
  ('a_star90',   'Galáctico',        'Conseguí un jugador de 90+.',   'best_overall', 90, '{"coins": 25000, "xp": 1500}', 40),
  ('a_played50', 'Veterano',         'Jugá 50 partidos.',             'total_matches', 50, '{"coins": 4000, "xp": 400}', 50),
  ('a_wins100',  'Leyenda',          'Ganá 100 partidos.',            'total_wins',   100, '{"coins": 30000, "xp": 3000}', 60),
  ('a_streak7',  'Fiel',             'Alcanzá una racha de 7 días.',  'daily_streak',   7, '{"coins": 5000, "xp": 500}', 70);

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.objectives where scope='daily')  as diarias,
  (select count(*) from public.objectives where scope='weekly') as semanales,
  (select count(*) from public.objectives where scope='season') as temporada,
  (select count(*) from public.achievements) as logros;
