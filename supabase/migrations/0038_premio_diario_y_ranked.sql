-- ============================================================
-- PREMIO DIARIO DE ACTIVIDAD + RANKED AJUSTADO POR NIVEL
--
-- 1. Los 3 clubes que más partidos jugaron en el día ganan
--    700 / 500 / 400 monedas. Se liquida solo, al día siguiente,
--    cuando alguien entra a Ligas (mismo patrón que el mercado).
-- 2. Ranked: si le ganás a alguien de nivel mucho más bajo que el
--    tuyo, ganás menos puntos (además del Elo por rating que ya
--    existía). -15% de la ganancia por cada nivel de diferencia,
--    con piso del 25%.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Premio diario
-- ------------------------------------------------------------
create table if not exists public.daily_top_prizes (
  day      date not null,
  rank     int  not null check (rank between 1 and 3),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  matches  int  not null,
  coins    bigint not null,
  primary key (day, rank)
);
alter table public.daily_top_prizes enable row level security;
drop policy if exists "daily_prizes_read" on public.daily_top_prizes;
create policy "daily_prizes_read" on public.daily_top_prizes for select using (true);

create or replace function public.settle_daily_top()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_day date; r record; v_rank int; v_paid int := 0;
  v_prize bigint; v_coins bigint;
begin
  -- Liquida los últimos 7 días pendientes (con partidos y sin premio pagado)
  for v_day in
    select distinct m.played_at::date
    from public.matches m
    where m.status = 'done'
      and m.played_at::date < current_date
      and m.played_at::date >= current_date - 7
      and not exists (select 1 from public.daily_top_prizes p where p.day = m.played_at::date)
    order by 1
  loop
    -- Lock para que dos visitas simultáneas no paguen doble
    perform pg_advisory_xact_lock(551200, (v_day - date '2020-01-01'));
    if exists (select 1 from public.daily_top_prizes p where p.day = v_day) then
      continue;
    end if;

    v_rank := 0;
    for r in
      select u.user_id, count(*)::int as n
      from (
        select home_user as user_id, played_at from public.matches
          where status = 'done' and played_at::date = v_day and home_user is not null
        union all
        select away_user, played_at from public.matches
          where status = 'done' and played_at::date = v_day and away_user is not null
      ) u
      group by u.user_id
      order by n desc, u.user_id
      limit 3
    loop
      v_rank := v_rank + 1;
      v_prize := case v_rank when 1 then 700 when 2 then 500 else 400 end;

      insert into public.daily_top_prizes (day, rank, user_id, matches, coins)
        values (v_day, v_rank, r.user_id, r.n, v_prize);

      select coins into v_coins from public.profiles where id = r.user_id for update;
      update public.profiles set coins = coins + v_prize where id = r.user_id;
      insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
        values (r.user_id, v_prize, 'daily_top', v_day::text, v_coins + v_prize);
      v_paid := v_paid + 1;
    end loop;
  end loop;

  return v_paid;
end; $$;
revoke all on function public.settle_daily_top() from public;
grant execute on function public.settle_daily_top() to authenticated;

-- Ganadores de ayer, para mostrarlos en Ligas.
create or replace function public.daily_top_winners()
returns TABLE("rank" int, "club_name" text, "crest_club" text, "matches" int, "coins" bigint)
language sql stable security definer set search_path = public as $$
  select p.rank, pr.club_name, pr.crest_club, p.matches, p.coins
  from public.daily_top_prizes p
  join public.profiles pr on pr.id = p.user_id
  where p.day = current_date - 1
  order by p.rank;
$$;
grant execute on function public.daily_top_winners() to authenticated;

-- ------------------------------------------------------------
-- 2) Ranked: la ganancia de puntos se reduce por diferencia de nivel
-- ------------------------------------------------------------
create or replace function public.apply_ranked_result(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; rh int; ra int; lh int; la int; eh numeric; ea numeric;
  sh numeric; sa numeric; k int := 32; dh int; da int; nh int; na int;
  fh numeric; fa numeric;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then return; end if;
  if m.competition <> 'ranked' or m.away_user is null then return; end if;
  if m.settled then return; end if;
  if m.status <> 'done' then return; end if;

  select rating, level into rh, lh from public.profiles where id = m.home_user;
  select rating, level into ra, la from public.profiles where id = m.away_user;

  eh := 1.0 / (1.0 + power(10, (ra - rh) / 400.0));
  ea := 1.0 - eh;
  sh := case when m.winner = 'home' then 1 when m.winner = 'draw' then 0.5 else 0 end;
  sa := 1 - sh;

  dh := round(k * (sh - eh))::int;
  da := round(k * (sa - ea))::int;

  -- Ganarle a uno de nivel mucho más bajo rinde poco: -15% de la
  -- ganancia por cada nivel de ventaja, piso 25%. Las pérdidas no
  -- se tocan.
  fh := greatest(0.25, 1 - 0.15 * greatest(0, coalesce(lh,1) - coalesce(la,1)));
  fa := greatest(0.25, 1 - 0.15 * greatest(0, coalesce(la,1) - coalesce(lh,1)));
  if dh > 0 then dh := greatest(1, round(dh * fh)::int); end if;
  if da > 0 then da := greatest(1, round(da * fa)::int); end if;

  nh := greatest(100, rh + dh);
  na := greatest(100, ra + da);

  update public.profiles set
    rating = nh,
    ranked_played = ranked_played + 1,
    ranked_won = ranked_won + case when m.winner = 'home' then 1 else 0 end,
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
