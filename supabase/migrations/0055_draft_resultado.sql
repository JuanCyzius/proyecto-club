-- ============================================================
-- ARREGLO DEL DRAFT: VICTORIAS Y RECOMPENSAS
--
-- Dos bugs:
--   1. Faltaba la función draft_result(): la aplicación la llamaba al
--      terminar cada partido, fallaba en silencio, y por eso la racha
--      nunca avanzaba (siempre volvía a 0 victorias).
--   2. Los partidos del draft pagaban monedas como un partido común,
--      además de las recompensas por fase. Ahora grant_match_reward()
--      no paga nada si el partido pertenece a un draft: lo único que
--      se cobra es el premio por la cantidad de victorias alcanzada.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Registro de partidos ya contabilizados (evita sumar dos veces)
-- ------------------------------------------------------------
alter table public.draft_runs
  add column if not exists counted_matches jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------
-- 1) Los partidos del draft no pagan recompensa por partido
-- ------------------------------------------------------------
create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_m record; v_rating int; v_win numeric; v_base numeric;
  v_reward bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select m.home_user, m.winner, m.ai_opponent, m.log, ao.rating as ai_rating
    into v_m
    from public.matches m
    left join public.ai_opponents ao on ao.id = m.ai_opponent
    where m.id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if v_m.home_user <> v_user then raise exception 'not your match'; end if;

  -- Los partidos del draft se pagan solo por fase alcanzada
  if v_m.log ? 'draft_run' then
    return 0;
  end if;

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

-- ------------------------------------------------------------
-- 2) Resultado del partido del draft
--
-- Suma la victoria (o cierra la racha con la derrota) y, cuando la
-- racha termina, paga el premio de la fase alcanzada UNA sola vez.
-- Es idempotente: llamarla dos veces con el mismo partido no vuelve
-- a sumar ni a pagar.
-- ------------------------------------------------------------
create or replace function public.draft_result(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); m record; r record; v_run uuid;
  v_won boolean; v_wins int; v_finished boolean := false;
  v_cfg record; v_rw jsonb; v_coins bigint; v_pay bigint := 0;
  v_pack text; v_packs jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into m from public.matches where id = p_match_id;
  if not found then raise exception 'partido no encontrado'; end if;
  if m.home_user <> v_user then raise exception 'no es tu partido'; end if;
  if m.status <> 'done' then raise exception 'el partido todavía no terminó'; end if;

  v_run := (m.log->>'draft_run')::uuid;
  if v_run is null then raise exception 'ese partido no es de un draft'; end if;

  -- Idempotencia: si este partido ya se contabilizó, se devuelve el estado
  select * into r from public.draft_runs where id = v_run and user_id = v_user for update;
  if not found then raise exception 'draft no encontrado'; end if;

  if coalesce(r.counted_matches, '[]'::jsonb) @> to_jsonb(p_match_id::text) then
    return jsonb_build_object(
      'won', m.winner = 'home', 'wins', r.wins,
      'finished', r.status = 'finished', 'coins', 0, 'packs', '[]'::jsonb
    );
  end if;

  v_won := m.winner = 'home';
  v_wins := r.wins + case when v_won then 1 else 0 end;

  update public.draft_runs set
    wins = v_wins,
    losses = r.losses + case when v_won then 0 else 1 end,
    counted_matches = coalesce(counted_matches, '[]'::jsonb) || to_jsonb(p_match_id::text)
    where id = v_run;

  -- La racha termina al perder o al llegar a 5 victorias
  if (not v_won) or v_wins >= 5 then
    v_finished := true;

    select * into v_cfg from public.draft_config where id = 1;
    v_rw := v_cfg.rewards -> v_wins::text;

    if v_rw is not null then
      v_pay := coalesce((v_rw->>'coins')::bigint, 0);
      if v_pay > 0 then
        select coins into v_coins from public.profiles where id = v_user for update;
        update public.profiles set coins = coins + v_pay where id = v_user;
        insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
          values (v_user, v_pay, 'draft_reward', v_run::text, v_coins + v_pay);
      end if;

      for v_pack in select jsonb_array_elements_text(coalesce(v_rw->'packs', '[]'::jsonb)) loop
        if exists (select 1 from public.packs where code = v_pack) then
          insert into public.draft_pack_credits (user_id, pack_code)
            values (v_user, v_pack);
          v_packs := v_packs || to_jsonb(v_pack);
        end if;
      end loop;
    end if;

    update public.draft_runs set status = 'finished' where id = v_run;
  end if;

  return jsonb_build_object(
    'won', v_won,
    'wins', v_wins,
    'finished', v_finished,
    'coins', v_pay,
    'packs', v_packs
  );
end; $$;
revoke all on function public.draft_result(uuid) from public;
grant execute on function public.draft_result(uuid) to authenticated;

select 'draft: victorias y recompensas arregladas' as resultado;

-- ------------------------------------------------------------
-- Red de seguridad: si el usuario cerró la app en medio del
-- partido, la victoria igual se contabiliza la próxima vez que
-- entre al Draft.
-- ------------------------------------------------------------
create or replace function public.draft_reconcile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); r record; v_last jsonb := '{}'::jsonb;
begin
  if v_user is null then return v_last; end if;

  for r in
    select m.id
    from public.matches m
    join public.draft_runs d on d.id = (m.log->>'draft_run')::uuid
    where m.home_user = v_user
      and m.status = 'done'
      and m.log ? 'draft_run'
      and d.status = 'playing'
      and not (coalesce(d.counted_matches, '[]'::jsonb) @> to_jsonb(m.id::text))
    order by m.played_at
  loop
    v_last := public.draft_result(r.id);
  end loop;

  return v_last;
end; $$;
revoke all on function public.draft_reconcile() from public;
grant execute on function public.draft_reconcile() to authenticated;

select 'draft: recompensas por fase y victorias contabilizadas' as resultado;
