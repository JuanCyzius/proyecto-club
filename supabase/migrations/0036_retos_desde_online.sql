-- ============================================================
-- RETOS DESDE "EN LÍNEA"
--
-- 1. Amistoso 1v1 sin apuesta: create_friendly_match(rival) crea un
--    partido pendiente que el rival ve en sus "partidos por jugar".
-- 2. Duelos de penales dirigidos: duel_create acepta un destinatario
--    opcional; ese duelo solo lo puede aceptar él, y le aparece
--    marcado como "reto para vos".
-- 3. nav_counts(): en línea + invitaciones pendientes en una sola
--    llamada, para los globitos de la barra de navegación.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Amistoso 1v1 sin apuesta
-- ------------------------------------------------------------
create or replace function public.create_friendly_match(p_opponent uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_opponent = v_user then raise exception 'no podés retarte a vos mismo'; end if;
  if not exists (select 1 from public.profiles where id = p_opponent) then
    raise exception 'rival no encontrado';
  end if;

  -- Ambos necesitan once completo
  if (select count(*) from public.squad_slots
      where user_id = v_user and card_id is not null and slot not like 'SUB%') < 11 then
    raise exception 'completá tu once antes de retar';
  end if;
  if (select count(*) from public.squad_slots
      where user_id = p_opponent and card_id is not null and slot not like 'SUB%') < 11 then
    raise exception 'tu rival todavía no tiene el once armado';
  end if;

  -- No apilar retos repetidos entre el mismo par
  if exists (select 1 from public.matches
             where status = 'pending' and kind = 'pvp' and stake = 0
               and ((home_user = v_user and away_user = p_opponent)
                 or (home_user = p_opponent and away_user = v_user))) then
    raise exception 'ya hay un amistoso pendiente con ese club';
  end if;

  insert into public.matches
    (home_user, away_user, kind, competition, seed, status,
     home_name, away_name, stake)
  values
    (v_user, p_opponent, 'pvp', 'friendly',
     encode(extensions.gen_random_bytes(8), 'hex'), 'pending',
     (select club_name from public.profiles where id = v_user),
     (select club_name from public.profiles where id = p_opponent),
     0)
  returning id into v_id;

  return v_id;
end; $$;
revoke all on function public.create_friendly_match(uuid) from public;
grant execute on function public.create_friendly_match(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2) Duelos dirigidos: columna de destinatario
-- ------------------------------------------------------------
alter table public.penalty_duels
  add column if not exists target uuid references public.profiles(id) on delete set null;

-- Los duelos dirigidos solo los ven el retador y el retado.
drop policy if exists "duels_read" on public.penalty_duels;
create policy "duels_read" on public.penalty_duels for select using (
  (status = 'open' and (target is null or target = auth.uid()))
  or challenger = auth.uid()
  or opponent = auth.uid()
);

-- Nueva firma con destinatario opcional. Se elimina la vieja para que
-- la API no tenga dos funciones ambiguas con el mismo nombre.
drop function if exists public.duel_create(int[], int[], bigint, uuid);

create or replace function public.duel_create(
  p_shots int[], p_dives int[],
  p_stake_coins bigint default 0,
  p_card_id uuid default null,
  p_target uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_id uuid; v_coins bigint;
  v_level int; v_rarity text; v_card record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if array_length(p_shots, 1) <> 7 or array_length(p_dives, 1) <> 7 then
    raise exception 'hacen falta 7 disparos y 7 atajadas';
  end if;
  if exists (select 1 from unnest(p_shots) z where z < 0 or z > 7)
     or exists (select 1 from unnest(p_dives) z where z < 0 or z > 7) then
    raise exception 'zona inválida';
  end if;

  if p_stake_coins < 0 then raise exception 'apuesta inválida'; end if;
  if p_stake_coins > 0 and p_card_id is not null then
    raise exception 'se apuestan monedas o un jugador, no las dos cosas';
  end if;

  if p_target is not null then
    if p_target = v_user then raise exception 'no podés retarte a vos mismo'; end if;
    if not exists (select 1 from public.profiles where id = p_target) then
      raise exception 'rival no encontrado';
    end if;
  end if;

  -- Un duelo abierto por vez, para no bloquear varias cartas a la vez
  if exists (select 1 from public.penalty_duels
             where challenger = v_user and status = 'open') then
    raise exception 'ya tenés un duelo esperando rival';
  end if;

  select level into v_level from public.profiles where id = v_user;

  -- Retener monedas
  if p_stake_coins > 0 then
    select coins into v_coins from public.profiles where id = v_user for update;
    if v_coins < p_stake_coins then raise exception 'insufficient funds'; end if;
    update public.profiles set coins = coins - p_stake_coins where id = v_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_user, -p_stake_coins, 'duel_hold', 'pending', v_coins - p_stake_coins);
  end if;

  -- Retener jugador
  if p_card_id is not null then
    select pc.id, pc.bound, pc.status, pc.injury_matches_left, pt.rarity
      into v_card
      from public.player_cards pc
      join public.player_templates pt on pt.id = pc.template_id
      where pc.id = p_card_id and pc.owner_id = v_user
      for update of pc;
    if not found then raise exception 'jugador no encontrado'; end if;
    if v_card.bound then raise exception 'ese jugador está vinculado al club'; end if;
    if v_card.status <> 'in_club' then raise exception 'ese jugador no está disponible'; end if;
    if v_card.injury_matches_left > 0 then raise exception 'no podés apostar un lesionado'; end if;
    if exists (select 1 from public.squad_slots
               where user_id = v_user and card_id = p_card_id) then
      raise exception 'sacá al jugador del once antes de apostarlo';
    end if;

    v_rarity := v_card.rarity;
    update public.player_cards set status = 'on_market' where id = p_card_id;
  end if;

  insert into public.penalty_duels(
    challenger, stake_coins, stake_rarity, challenger_card,
    challenger_level, challenger_shots, challenger_dives, target
  ) values (
    v_user, p_stake_coins, v_rarity, p_card_id,
    coalesce(v_level, 1), to_jsonb(p_shots), to_jsonb(p_dives), p_target
  ) returning id into v_id;

  update public.coin_ledger set ref = v_id::text
    where user_id = v_user and reason = 'duel_hold' and ref = 'pending';

  return v_id;
end; $$;
revoke all on function public.duel_create(int[], int[], bigint, uuid, uuid) from public;
grant execute on function public.duel_create(int[], int[], bigint, uuid, uuid) to authenticated;

-- El listado ahora oculta duelos dirigidos a otros y marca los tuyos.
drop function if exists public.duels_open();
create or replace function public.duels_open()
returns TABLE(
  "id" uuid, "challenger" uuid, "username" text, "club_name" text,
  "crest_club" text, "challenger_level" int, "stake_coins" bigint,
  "stake_rarity" text, "created_at" timestamptz, "is_mine" boolean,
  "for_you" boolean
)
language sql stable security definer set search_path = public as $$
  select d.id, d.challenger, p.username, p.club_name, p.crest_club,
         d.challenger_level, d.stake_coins, d.stake_rarity, d.created_at,
         d.challenger = auth.uid(),
         d.target = auth.uid()
  from public.penalty_duels d
  join public.profiles p on p.id = d.challenger
  where d.status = 'open'
    and (d.target is null or d.target = auth.uid() or d.challenger = auth.uid())
  order by (d.target = auth.uid()) desc nulls last, d.created_at desc
  limit 40;
$$;
grant execute on function public.duels_open() to authenticated;

-- Solo el destinatario puede aceptar un duelo dirigido: se redefine
-- duel_play con esa verificación (la lógica de juego queda idéntica).
create or replace function public.duel_play(
  p_id uuid, p_shots int[], p_dives int[], p_card_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); d record; v_coins bigint;
  v_level int; v_card record;
  v_zc int; v_zo int;           -- zonas que cubre cada arquero
  cs int[]; cd int[]; os_ int[]; od int[];
  i int; v_cg int := 0; v_og int := 0;
  v_rounds jsonb := '[]'::jsonb;
  v_ch_goal boolean; v_op_goal boolean;
  v_winner uuid; v_loser uuid; v_pot bigint; v_fee bigint; v_net bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into d from public.penalty_duels where id = p_id for update;
  if not found then raise exception 'duelo no encontrado'; end if;
  if d.status <> 'open' then raise exception 'ese duelo ya se jugó'; end if;
  if d.challenger = v_user then raise exception 'no podés jugar contra vos mismo'; end if;
  if d.target is not null and d.target <> v_user then
    raise exception 'ese duelo es un reto dirigido a otro club';
  end if;

  if array_length(p_shots, 1) <> 7 or array_length(p_dives, 1) <> 7 then
    raise exception 'hacen falta 7 disparos y 7 atajadas';
  end if;
  if exists (select 1 from unnest(p_shots) z where z < 0 or z > 7)
     or exists (select 1 from unnest(p_dives) z where z < 0 or z > 7) then
    raise exception 'zona inválida';
  end if;

  select level into v_level from public.profiles where id = v_user;

  -- ---- Igualar la apuesta ----
  if d.stake_coins > 0 then
    select coins into v_coins from public.profiles where id = v_user for update;
    if v_coins < d.stake_coins then raise exception 'insufficient funds'; end if;
    update public.profiles set coins = coins - d.stake_coins where id = v_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_user, -d.stake_coins, 'duel_hold', p_id::text, v_coins - d.stake_coins);
  end if;

  if d.challenger_card is not null then
    if p_card_id is null then
      raise exception 'este duelo se apuesta con un jugador %', d.stake_rarity;
    end if;
    select pc.id, pc.bound, pc.status, pc.injury_matches_left, pt.rarity
      into v_card
      from public.player_cards pc
      join public.player_templates pt on pt.id = pc.template_id
      where pc.id = p_card_id and pc.owner_id = v_user
      for update of pc;
    if not found then raise exception 'jugador no encontrado'; end if;
    if v_card.rarity <> d.stake_rarity then
      raise exception 'tenés que apostar un jugador de rareza %', d.stake_rarity;
    end if;
    if v_card.bound then raise exception 'ese jugador está vinculado al club'; end if;
    if v_card.status <> 'in_club' then raise exception 'ese jugador no está disponible'; end if;
    if v_card.injury_matches_left > 0 then raise exception 'no podés apostar un lesionado'; end if;
    if exists (select 1 from public.squad_slots
               where user_id = v_user and card_id = p_card_id) then
      raise exception 'sacá al jugador del once antes de apostarlo';
    end if;
    update public.player_cards set status = 'on_market' where id = p_card_id;
  end if;

  -- ---- Resolver la tanda ----
  -- Zonas de cada arquero según la diferencia de nivel a su favor
  v_zc := public.keeper_zones(d.challenger_level - coalesce(v_level, 1));
  v_zo := public.keeper_zones(coalesce(v_level, 1) - d.challenger_level);

  select array_agg(value::int order by ord) into cs
    from jsonb_array_elements_text(d.challenger_shots) with ordinality t(value, ord);
  select array_agg(value::int order by ord) into cd
    from jsonb_array_elements_text(d.challenger_dives) with ordinality t(value, ord);
  os_ := p_shots; od := p_dives;

  for i in 1..7 loop
    -- El retador patea: ataja si su disparo cae en las zonas del rival.
    -- Las zonas cubiertas se derivan de la elección grabada, de forma
    -- determinista: la zona elegida y las siguientes, en círculo.
    v_ch_goal := not public._zone_covered(cs[i], od[i], v_zo);
    v_op_goal := not public._zone_covered(os_[i], cd[i], v_zc);

    if i <= 5 or v_cg = v_og then
      if v_ch_goal then v_cg := v_cg + 1; end if;
      if v_op_goal then v_og := v_og + 1; end if;

      v_rounds := v_rounds || jsonb_build_object(
        'round', i,
        'challenger_shot', cs[i], 'challenger_goal', v_ch_goal,
        'opponent_dive', od[i], 'opponent_zones', v_zo,
        'opponent_shot', os_[i], 'opponent_goal', v_op_goal,
        'challenger_dive', cd[i], 'challenger_zones', v_zc,
        'score', jsonb_build_array(v_cg, v_og)
      );
    end if;

    exit when i >= 5 and v_cg <> v_og;
  end loop;

  -- Si siguen empatados tras las 7, gana el visitante por reglamento propio
  if v_cg = v_og then v_og := v_og + 1; end if;

  v_winner := case when v_cg > v_og then d.challenger else v_user end;
  v_loser  := case when v_cg > v_og then v_user else d.challenger end;

  -- ---- Pagar ----
  if d.stake_coins > 0 then
    v_pot := d.stake_coins * 2;
    v_fee := greatest(1, (v_pot * 0.05)::bigint);   -- comisión: sumidero
    v_net := v_pot - v_fee;
    select coins into v_coins from public.profiles where id = v_winner for update;
    update public.profiles set coins = coins + v_net where id = v_winner;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_winner, v_net, 'duel_win', p_id::text, v_coins + v_net);
  end if;

  -- Las cartas apostadas van al ganador
  if d.challenger_card is not null then
    update public.player_cards
      set owner_id = v_winner, status = 'in_club'
      where id in (d.challenger_card, p_card_id);
  end if;

  update public.penalty_duels set
    status = 'done', opponent = v_user, opponent_level = coalesce(v_level, 1),
    opponent_shots = to_jsonb(p_shots), opponent_dives = to_jsonb(p_dives),
    challenger_score = v_cg, opponent_score = v_og,
    winner = v_winner, rounds = v_rounds, played_at = now()
  where id = p_id;

  return jsonb_build_object(
    'challenger_score', v_cg, 'opponent_score', v_og,
    'winner', v_winner, 'you_won', v_winner = v_user,
    'rounds', v_rounds,
    'your_keeper_zones', v_zo, 'rival_keeper_zones', v_zc
  );
end; $$;
revoke all on function public.duel_play(uuid, int[], int[], uuid) from public;
grant execute on function public.duel_play(uuid, int[], int[], uuid) to authenticated;

-- ------------------------------------------------------------
-- 3) Contadores para la barra de navegación
--    online: mismos latido y ventana que online_count().
--    invites: partidos PvP pendientes míos + duelos dirigidos a mí.
-- ------------------------------------------------------------
create or replace function public.nav_counts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_last timestamptz;
  v_online int; v_invites int;
begin
  if v_user is null then return jsonb_build_object('online', 0, 'invites', 0); end if;

  -- Latido con freno: como mucho una escritura por minuto y usuario.
  select last_seen into v_last from public.profiles where id = v_user;
  if v_last is null or now() - v_last >= interval '60 seconds' then
    update public.profiles set last_seen = now() where id = v_user;
  end if;

  select count(*)::int into v_online from public.profiles
    where last_seen > now() - interval '3 minutes';

  select
    (select count(*) from public.matches
      where status = 'pending' and kind = 'pvp'
        and (home_user = v_user or away_user = v_user))
    +
    (select count(*) from public.penalty_duels
      where status = 'open' and target = v_user)
    into v_invites;

  return jsonb_build_object('online', v_online, 'invites', coalesce(v_invites, 0));
end; $$;
revoke all on function public.nav_counts() from public;
grant execute on function public.nav_counts() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select public.nav_counts() as contadores;
