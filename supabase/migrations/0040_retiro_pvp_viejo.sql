-- ============================================================
-- RETIRO DEL PvP VIEJO (partidos simulados 1v1)
--
-- El nuevo PvP arcade (en /pvp-lab) lo reemplaza. Se retira el viejo:
-- 1. Se cancelan los retos pendientes y SE DEVUELVE cada apuesta que
--    estaba retenida (el escrow se tomaba al crear el reto).
-- 2. Se eliminan las funciones que creaban partidos PvP nuevos.
-- 3. El globito de invitaciones pasa a contar solo duelos de penales
--    dirigidos (que siguen vigentes).
--
-- SE CONSERVA: historial de partidos, rating/división, victorias
-- ranked, premios diarios y duelos de penales. Todo eso migra al
-- PvP nuevo cuando esté online.
-- ============================================================

-- 1) Reembolsar y cancelar retos pendientes
do $$
declare r record; v_coins bigint;
begin
  for r in
    select id, home_user, away_user, stake from public.matches
    where status = 'pending' and kind = 'pvp'
  loop
    if coalesce(r.stake, 0) > 0 then
      select coins into v_coins from public.profiles where id = r.home_user for update;
      update public.profiles set coins = coins + r.stake where id = r.home_user;
      insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
        values (r.home_user, r.stake, 'wager_refund', r.id::text, v_coins + r.stake);

      select coins into v_coins from public.profiles where id = r.away_user for update;
      update public.profiles set coins = coins + r.stake where id = r.away_user;
      insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
        values (r.away_user, r.stake, 'wager_refund', r.id::text, v_coins + r.stake);
    end if;
    update public.matches set status = 'cancelled' where id = r.id;
  end loop;
end $$;

-- 2) Sin creación de partidos PvP nuevos
drop function if exists public.create_wager_match(uuid, bigint);
drop function if exists public.create_friendly_match(uuid);
drop function if exists public.find_ranked_match();
drop function if exists public.create_group_league(text);

-- 3) Invitaciones: solo duelos de penales dirigidos
create or replace function public.nav_counts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_last timestamptz;
  v_online int; v_invites int;
begin
  if v_user is null then return jsonb_build_object('online', 0, 'invites', 0); end if;

  select last_seen into v_last from public.profiles where id = v_user;
  if v_last is null or now() - v_last >= interval '60 seconds' then
    update public.profiles set last_seen = now() where id = v_user;
  end if;

  select count(*)::int into v_online from public.profiles
    where last_seen > now() - interval '3 minutes';

  select count(*)::int into v_invites from public.penalty_duels
    where status = 'open' and target = v_user;

  return jsonb_build_object('online', v_online, 'invites', coalesce(v_invites, 0));
end; $$;
revoke all on function public.nav_counts() from public;
grant execute on function public.nav_counts() to authenticated;

select 'PvP viejo retirado; apuestas pendientes devueltas' as resultado;
