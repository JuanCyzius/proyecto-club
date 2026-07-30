-- ============================================================
-- MENOS LESIONES · RECOMPENSAS POR DIFICULTAD
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tasa de lesión
--
-- Estaba en 4% por jugador. Como participan 14 cartas por partido,
-- eso daba un 43% de que alguien se lesionara: uno de cada dos
-- partidos. Baja a 0,8%, que deja una lesión cada 9 partidos: un
-- imprevisto y no una rutina.
-- ------------------------------------------------------------
create or replace function public.apply_match_injuries(p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  i int; v_inj record; v_total numeric; v_r numeric; v_acc numeric := 0;
  v_out jsonb := '[]'::jsonb; v_key text; v_last timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Como mucho una vez cada 5 segundos por usuario
  v_key := 'injuries:' || v_user::text;
  select last_run into v_last from public.rate_limits where key = v_key for update;
  if v_last is not null and now() - v_last < interval '5 seconds' then
    return v_out;
  end if;
  insert into public.rate_limits (key, last_run) values (v_key, now())
    on conflict (key) do update set last_run = now();

  -- Descontar un partido a las lesiones existentes
  update public.player_cards
    set injury_matches_left = injury_matches_left - 1,
        injury_type = case when injury_matches_left - 1 <= 0 then null else injury_type end
    where owner_id = v_user and injury_matches_left > 0;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return v_out;
  end if;

  select sum(weight) into v_total from public.injury_types;

  for i in 1..array_length(p_card_ids, 1) loop
    if random() < 0.008 then
      v_r := random() * v_total;
      v_acc := 0;
      for v_inj in select * from public.injury_types order by code loop
        v_acc := v_acc + v_inj.weight;
        if v_r <= v_acc then
          update public.player_cards
            set injury_type = v_inj.code,
                injury_matches_left = v_inj.severity
            where id = p_card_ids[i] and owner_id = v_user
              and injury_matches_left = 0;
          if found then
            v_out := v_out || jsonb_build_object(
              'card_id', p_card_ids[i], 'type', v_inj.code,
              'name', v_inj.name, 'matches', v_inj.severity
            );
          end if;
          exit;
        end if;
      end loop;
    end if;
  end loop;

  return v_out;
end; $$;
revoke all on function public.apply_match_injuries(uuid[]) from public;
grant execute on function public.apply_match_injuries(uuid[]) to authenticated;

-- Las lesiones graves también se vuelven más raras: con menos lesiones
-- en total, conviene que las que ocurran sean casi siempre leves.
update public.injury_types set weight = 26 where code = 'knock_shoulder';
update public.injury_types set weight = 28 where code = 'knock_ankle';
update public.injury_types set weight = 24 where code = 'bruise_thigh';
update public.injury_types set weight = 11 where code = 'strain_calf';
update public.injury_types set weight =  7 where code = 'strain_groin';
update public.injury_types set weight =  3 where code = 'sprain_ankle';
update public.injury_types set weight =  1 where code = 'hamstring';
update public.injury_types set weight =  0.4 where code = 'knee';

-- ------------------------------------------------------------
-- 2) Recompensa por victoria según dificultad
--
-- Antes el salto entre niveles era del 10-20%, así que jugar en el
-- nivel 90 casi no compensaba el riesgo. Ahora crece de forma
-- compuesta: +18% en los primeros escalones y hasta +40% en los
-- últimos. Del más fácil al más difícil hay un factor de 6,5.
--
--   Nivel 65 → 110      Nivel 85 → 265
--   Nivel 70 → 130      Nivel 90 → 366
--   Nivel 75 → 158      Selección Mundial → 513
--   Nivel 80 → 201      Los Inmortales → 718
-- ------------------------------------------------------------
create or replace function public.win_reward(p_rating int)
returns numeric language sql immutable as $$
  select case
    when p_rating <= 66 then 110
    when p_rating <= 71 then 130
    when p_rating <= 76 then 158
    when p_rating <= 81 then 201
    when p_rating <= 86 then 265
    when p_rating <= 91 then 366
    when p_rating <= 96 then 513
    else 718
  end::numeric;
$$;
grant execute on function public.win_reward(int) to authenticated;

create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_m record; v_rating int; v_win numeric; v_base numeric;
  v_mult numeric; v_today int; v_reward bigint; v_coins bigint;
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

  -- Rendimientos decrecientes dentro del día, para que no se pueda
  -- exprimir el modo jugando cien partidos seguidos.
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

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  t.name as nivel,
  public.win_reward(t.max_rating)::int as monedas_por_victoria
from public.difficulty_tiers t
order by t.sort;
