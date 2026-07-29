-- ============================================================
-- FASE 8 (parte 2) — PASE DE TEMPORADA, ROLLOVER Y RANKINGS
--
-- El pase se gana con XP: nada se compra con dinero real.
-- El rollover cierra la temporada, reparte premios por posición,
-- reinicia las clasificaciones y abre la siguiente.
-- CONSERVA club, cartas, monedas, ítems y logros.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Niveles del pase de temporada
-- ------------------------------------------------------------
create table if not exists public.season_pass_tiers (
  level    int primary key,
  xp_needed int not null,
  rewards  jsonb not null,
  name     text not null
);
alter table public.season_pass_tiers enable row level security;
drop policy if exists "pass_read" on public.season_pass_tiers;
create policy "pass_read" on public.season_pass_tiers for select using (true);

delete from public.season_pass_tiers;
insert into public.season_pass_tiers (level, xp_needed, rewards, name) values
  (1,   250, '{"coins": 500}',                                  'Pretemporada'),
  (2,   600, '{"coins": 800, "items": {"stam_10": 2}}',         'Primeros pasos'),
  (3,  1100, '{"coins": 1200, "items": {"heal_1": 1}}',         'En forma'),
  (4,  1800, '{"coins": 2000, "items": {"stam_20": 2}}',        'Titular'),
  (5,  2700, '{"coins": 3000, "items": {"heal_2": 1}}',         'Referente'),
  (6,  3800, '{"coins": 4500, "items": {"stam_30": 1}}',        'Capitán'),
  (7,  5200, '{"coins": 6500, "items": {"heal_2": 2}}',         'Crack'),
  (8,  7000, '{"coins": 9000, "items": {"stam_30": 2}}',        'Figura'),
  (9,  9200, '{"coins": 13000, "items": {"heal_3": 1}}',        'Ídolo'),
  (10,12000, '{"coins": 20000, "items": {"heal_3": 2, "stam_30": 2}}', 'Leyenda');

-- XP acumulada por temporada (se reinicia en el rollover)
alter table public.profiles
  add column if not exists season_xp int not null default 0;

create table if not exists public.user_pass_claims (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  level     int  not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, season_id, level)
);
alter table public.user_pass_claims enable row level security;
drop policy if exists "pass_claims_own" on public.user_pass_claims;
create policy "pass_claims_own" on public.user_pass_claims
  for select using (auth.uid() = user_id);

-- El XP de temporada sube junto con el XP general
create or replace function public._grant_rewards(
  p_user uuid, p_rewards jsonb, p_reason text, p_ref text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_coins bigint; v_add bigint; v_xp int; v_code text; v_qty int;
  v_level int; v_total_xp int; v_new_level int;
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
    update public.profiles
      set xp = xp + v_xp, season_xp = season_xp + v_xp
      where id = p_user;
    select level, xp into v_level, v_total_xp from public.profiles where id = p_user;
    v_new_level := greatest(1, 1 + (v_total_xp / 500));
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
-- 2) Estado del pase
-- ------------------------------------------------------------
create or replace function public.my_season_pass()
returns TABLE(
  "level" int, "name" text, "xp_needed" int, "rewards" jsonb,
  "unlocked" boolean, "claimed" boolean, "season_xp" int
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_xp int; v_season uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select season_xp into v_xp from public.profiles where id = v_user;
  select id into v_season from public.seasons where status = 'active' limit 1;

  return query
  select t.level, t.name, t.xp_needed, t.rewards,
         v_xp >= t.xp_needed,
         exists (select 1 from public.user_pass_claims c
                 where c.user_id = v_user and c.season_id = v_season
                   and c.level = t.level),
         v_xp
  from public.season_pass_tiers t
  order by t.level;
end; $$;
grant execute on function public.my_season_pass() to authenticated;

create or replace function public.claim_pass_level(p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); t record; v_xp int; v_season uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select id into v_season from public.seasons where status = 'active' limit 1;
  if v_season is null then raise exception 'no hay temporada activa'; end if;

  select * into t from public.season_pass_tiers where level = p_level;
  if not found then raise exception 'nivel inválido'; end if;

  if exists (select 1 from public.user_pass_claims
             where user_id = v_user and season_id = v_season and level = p_level) then
    raise exception 'ya reclamaste ese nivel';
  end if;

  select season_xp into v_xp from public.profiles where id = v_user;
  if v_xp < t.xp_needed then
    raise exception 'te faltan % de XP', t.xp_needed - v_xp;
  end if;

  insert into public.user_pass_claims(user_id, season_id, level)
    values (v_user, v_season, p_level);

  -- Sin XP en la recompensa: evita realimentar el propio pase
  perform public._grant_rewards(
    v_user, t.rewards - 'xp', 'season_pass', v_season::text || ':' || p_level::text
  );
  return t.rewards;
end; $$;
revoke all on function public.claim_pass_level(int) from public;
grant execute on function public.claim_pass_level(int) to authenticated;

-- ------------------------------------------------------------
-- 3) Historial de temporadas
-- ------------------------------------------------------------
create table if not exists public.season_results (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  position  int not null,
  points    int not null default 0,
  rating    int not null default 1000,
  division  int not null default 10,
  reward    bigint not null default 0,
  primary key (season_id, user_id)
);
alter table public.season_results enable row level security;
drop policy if exists "season_results_read" on public.season_results;
create policy "season_results_read" on public.season_results for select using (true);

-- ------------------------------------------------------------
-- 4) Rollover de temporada
--    Cierra, premia, reinicia clasificaciones y abre la siguiente.
--    NO toca club, cartas, monedas, ítems ni logros.
-- ------------------------------------------------------------
create or replace function public.rollover_season()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old uuid; v_num int; v_new uuid; r record; v_pos int := 0;
  v_reward bigint; v_paid int := 0; v_comp uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select id, number into v_old, v_num
    from public.seasons where status = 'active' limit 1;
  if v_old is null then raise exception 'no hay temporada activa'; end if;

  -- Clasificación final de la liga del grupo
  select id into v_comp from public.competitions
    where season_id = v_old and type = 'league' and status = 'active'
    order by created_at desc limit 1;

  if v_comp is not null then
    for r in
      select s.user_id, s.points, s.gf, s.ga
      from public.standings s
      where s.competition_id = v_comp
      order by s.points desc, (s.gf - s.ga) desc, s.gf desc
    loop
      v_pos := v_pos + 1;
      -- Premio por posición: decreciente
      v_reward := case
        when v_pos = 1 then 50000
        when v_pos = 2 then 30000
        when v_pos = 3 then 20000
        when v_pos <= 6 then 10000
        when v_pos <= 10 then 5000
        else 2000 end;

      insert into public.season_results(season_id, user_id, position, points, rating, division, reward)
      select v_old, r.user_id, v_pos, r.points, p.rating, p.division, v_reward
        from public.profiles p where p.id = r.user_id
      on conflict (season_id, user_id) do nothing;

      perform public._grant_rewards(
        r.user_id, jsonb_build_object('coins', v_reward),
        'season_reward', v_old::text
      );
      v_paid := v_paid + 1;
    end loop;

    update public.competitions set status = 'ended' where id = v_comp;
  end if;

  -- Cerrar la temporada
  update public.seasons set status = 'ended', ends_at = now() where id = v_old;

  -- Nueva temporada
  insert into public.seasons (number, name)
    values (v_num + 1, 'Temporada ' || (v_num + 1)::text)
    returning id into v_new;

  -- Reinicios competitivos (NO toca posesiones)
  update public.profiles set
    season_xp = 0,
    rating = 1000 + ((rating - 1000) / 3),   -- reversión suave a la media
    division = greatest(1, least(10, 10 - floor(((1000 + ((rating - 1000) / 3)) - 800) / 150)::int));

  return jsonb_build_object(
    'closed_season', v_num,
    'new_season', v_num + 1,
    'rewarded_users', v_paid
  );
end; $$;
revoke all on function public.rollover_season() from public;
grant execute on function public.rollover_season() to authenticated;

-- ------------------------------------------------------------
-- 5) Rankings
-- ------------------------------------------------------------
create index if not exists idx_profiles_rating on public.profiles (rating desc);
create index if not exists idx_profiles_level  on public.profiles (level desc, xp desc);

create or replace function public.leaderboard(p_kind text default 'rating')
returns TABLE(
  "user_id" uuid, "username" text, "club_name" text,
  "value" int, "extra" int
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.club_name,
         case p_kind
           when 'level'  then p.level
           when 'xp'     then p.season_xp
           when 'wins'   then p.ranked_won
           else p.rating
         end,
         case p_kind
           when 'level'  then p.xp
           when 'wins'   then p.ranked_played
           else p.division
         end
  from public.profiles p
  order by
    case p_kind
      when 'level' then p.level
      when 'xp'    then p.season_xp
      when 'wins'  then p.ranked_won
      else p.rating
    end desc
  limit 50;
$$;
grant execute on function public.leaderboard(text) to authenticated;

-- Palmarés histórico: títulos por club
create or replace function public.hall_of_fame()
returns TABLE("user_id" uuid, "username" text, "club_name" text, "titles" int)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.club_name, count(*)::int
  from public.season_results r
  join public.profiles p on p.id = r.user_id
  where r.position = 1
  group by r.user_id, p.username, p.club_name
  order by count(*) desc
  limit 20;
$$;
grant execute on function public.hall_of_fame() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.season_pass_tiers) as niveles_pase,
  (select count(*) from public.seasons where status='active') as temporada_activa,
  (select count(*) from public.season_results) as resultados_historicos;
