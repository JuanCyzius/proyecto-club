-- ============================================================
-- SIN DESCUENTO POR RENDIMIENTOS DECRECIENTES
--
-- 0031 agregó un descuento del 8% por cada victoria dentro del
-- mismo día (con piso del 25%), para desalentar el "grindeo". Se
-- saca por completo: la victoria siempre paga dentro del rango
-- acordado por nivel (100-120 en el 65, 140-170 en el 70, etc.),
-- sin importar cuántos partidos se jueguen en el día.
-- ============================================================

create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_m record; v_rating int; v_win numeric; v_base numeric;
  v_reward bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select m.home_user, m.winner, m.ai_opponent, ao.rating as ai_rating
    into v_m
    from public.matches m
    left join public.ai_opponents ao on ao.id = m.ai_opponent
    where m.id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if v_m.home_user <> v_user then raise exception 'not your match'; end if;

  if exists (
    select 1 from public.coin_ledger
    where user_id = v_user and reason = 'match_reward' and ref = p_match_id::text
  ) then
    return 0;
  end if;

  v_rating := coalesce(v_m.ai_rating, 65);
  v_win := public.win_reward(v_rating);

  v_base := case
    when v_m.winner = 'home' then v_win
    when v_m.winner = 'draw' then v_win * 0.40
    else v_win * 0.15
  end;

  -- Sin multiplicador por partidos jugados en el día: la recompensa
  -- de una victoria siempre cae dentro del rango de su nivel.
  v_reward := greatest(1, floor(v_base))::bigint;

  select coins into v_coins from public.profiles where id = v_user for update;
  update public.profiles set coins = coins + v_reward where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_reward, 'match_reward', p_match_id::text, v_coins + v_reward);
  update public.matches set reward_coins = v_reward where id = p_match_id;

  return v_reward;
end; $$;
revoke all on function public.grant_match_reward(uuid) from public;
grant execute on function public.grant_match_reward(uuid) to authenticated;
