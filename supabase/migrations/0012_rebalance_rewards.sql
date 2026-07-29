-- ============================================================
-- REBALANCEO DE RECOMPENSAS DE PARTIDO
--
-- Antes: victoria = 150 + rating*4  -> 390 monedas contra un rival
-- de media 60. Con el sobre Bronce a 400, se compraba en 1 partido.
--
-- Ahora: victoria = 100 * (1 + (rating-60) * 0.05)
--   rival 60 -> 100 | 74 -> 170 | 87 -> 235 | 91 -> 255
--   empate  = 40% de la victoria
--   derrota = 15% de la victoria
--
-- Se mantienen los rendimientos decrecientes por partido del día
-- (-8% acumulativo, con piso del 25%) para evitar el farmeo.
-- ============================================================

create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_m      record;
  v_rating int;
  v_win    numeric;
  v_base   numeric;
  v_mult   numeric;
  v_today  int;
  v_reward bigint;
  v_coins  bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select m.home_user, m.winner, m.ai_opponent, ao.rating as ai_rating
    into v_m
    from public.matches m
    left join public.ai_opponents ao on ao.id = m.ai_opponent
    where m.id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if v_m.home_user <> v_user then raise exception 'not your match'; end if;

  -- Idempotencia: un partido paga una sola vez
  if exists (
    select 1 from public.coin_ledger
    where user_id = v_user and reason = 'match_reward' and ref = p_match_id::text
  ) then
    return 0;
  end if;

  v_rating := coalesce(v_m.ai_rating, 65);

  -- Pago base según la dificultad del rival
  v_win := 100 * (1 + (v_rating - 60) * 0.05);
  v_win := greatest(v_win, 60);   -- suelo por si aparece un rival muy flojo

  v_base := case
    when v_m.winner = 'home' then v_win
    when v_m.winner = 'draw' then v_win * 0.40
    else v_win * 0.15
  end;

  -- Rendimientos decrecientes por partido recompensado hoy
  select count(*) into v_today from public.coin_ledger
    where user_id = v_user and reason = 'match_reward'
      and created_at >= date_trunc('day', now());
  v_mult := greatest(0.25, 1 - v_today * 0.08);

  v_reward := greatest(1, floor(v_base * v_mult))::bigint;

  select coins into v_coins from public.profiles where id = v_user for update;
  update public.profiles set coins = coins + v_reward where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_reward, 'match_reward', p_match_id::text, v_coins + v_reward);
  update public.matches set reward_coins = v_reward where id = p_match_id;

  return v_reward;
end; $$;

revoke all on function public.grant_match_reward(uuid) from public;
grant execute on function public.grant_match_reward(uuid) to authenticated;

-- ============================================================
-- Tabla de referencia (solo informativa)
-- ============================================================
-- Rival             Media   Victoria  Empate  Derrota
-- Cantera FC          60       100       40      15
-- Río Verde           64       120       48      18
-- Unión Central       71       155       62      23
-- Atlético Puerto     74       170       68      26
-- Sporting Nébula     80       200       80      30
-- Dínamo Real         82       210       84      32
-- Corona Elite        87       235       94      35
-- Legado Eterno       91       255      102      38
--
-- Sobre Bronce (400) = 4 victorias contra el rival más flojo.
