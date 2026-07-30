-- ============================================================
-- TANDA DE PENALES PvP
--
-- Cómo funciona
--   · El arco se divide en 8 zonas. El pateador elige 1.
--   · El arquero cubre entre 2 y 6 zonas según la diferencia de nivel
--     entre los dos clubes. Si la zona elegida está cubierta, ataja.
--   · 5 rondas y muerte súbita si siguen empatados.
--
-- Es asincrónico: el retador deja grabados sus disparos y sus atajadas,
-- y el rival juega la tanda completa cuando quiera. No hacen falta
-- conexiones abiertas ni que los dos estén online a la vez.
--
-- Apuestas: monedas o un jugador (de la misma rareza), o nada. Lo que
-- se apuesta queda retenido hasta que se resuelve.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Zonas del arquero según diferencia de nivel
-- ------------------------------------------------------------
create or replace function public.keeper_zones(p_diff int)
returns int language sql immutable as $$
  select case
    when p_diff <= -12 then 2
    when p_diff <= -6  then 3
    when p_diff <   6  then 4
    when p_diff <  12  then 5
    else 6
  end;
$$;
grant execute on function public.keeper_zones(int) to authenticated;

-- ------------------------------------------------------------
-- 2) Duelos
-- ------------------------------------------------------------
create table if not exists public.penalty_duels (
  id            uuid primary key default gen_random_uuid(),
  challenger    uuid not null references public.profiles(id) on delete cascade,
  opponent      uuid references public.profiles(id) on delete cascade,
  status        text not null default 'open',   -- open | done | cancelled

  -- Apuesta simétrica: los dos ponen lo mismo
  stake_coins   bigint not null default 0,
  stake_rarity  text,                            -- rareza exigida si se apuesta jugador
  challenger_card uuid references public.player_cards(id) on delete set null,
  opponent_card   uuid references public.player_cards(id) on delete set null,

  -- Nivel congelado al crear el duelo (para que no cambie a mitad)
  challenger_level int not null default 1,
  opponent_level   int,

  -- Jugadas grabadas del retador: 7 disparos y 7 atajadas (5 + muerte súbita)
  challenger_shots jsonb not null,
  challenger_dives jsonb not null,
  opponent_shots   jsonb,
  opponent_dives   jsonb,

  -- Resultado
  challenger_score int,
  opponent_score   int,
  winner           uuid,
  rounds           jsonb,

  created_at    timestamptz not null default now(),
  played_at     timestamptz
);
create index if not exists idx_duels_open
  on public.penalty_duels (status, created_at desc);
create index if not exists idx_duels_mine
  on public.penalty_duels (challenger, status);

alter table public.penalty_duels enable row level security;
drop policy if exists "duels_read" on public.penalty_duels;
-- Los duelos abiertos son públicos (para poder aceptarlos); los cerrados
-- solo los ven sus participantes.
create policy "duels_read" on public.penalty_duels for select using (
  status = 'open' or challenger = auth.uid() or opponent = auth.uid()
);

-- ------------------------------------------------------------
-- 3) Crear un duelo (retener la apuesta)
-- ------------------------------------------------------------
create or replace function public.duel_create(
  p_shots int[], p_dives int[],
  p_stake_coins bigint default 0,
  p_card_id uuid default null
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
  -- Las zonas válidas van de 0 a 7
  if exists (select 1 from unnest(p_shots) z where z < 0 or z > 7)
     or exists (select 1 from unnest(p_dives) z where z < 0 or z > 7) then
    raise exception 'zona inválida';
  end if;

  if p_stake_coins < 0 then raise exception 'apuesta inválida'; end if;
  if p_stake_coins > 0 and p_card_id is not null then
    raise exception 'se apuestan monedas o un jugador, no las dos cosas';
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
    challenger_level, challenger_shots, challenger_dives
  ) values (
    v_user, p_stake_coins, v_rarity, p_card_id,
    coalesce(v_level, 1), to_jsonb(p_shots), to_jsonb(p_dives)
  ) returning id into v_id;

  update public.coin_ledger set ref = v_id::text
    where user_id = v_user and reason = 'duel_hold' and ref = 'pending';

  return v_id;
end; $$;
revoke all on function public.duel_create(int[], int[], bigint, uuid) from public;
grant execute on function public.duel_create(int[], int[], bigint, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4) Cancelar un duelo que nadie aceptó
-- ------------------------------------------------------------
create or replace function public.duel_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d record; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into d from public.penalty_duels where id = p_id for update;
  if not found then raise exception 'duelo no encontrado'; end if;
  if d.challenger <> v_user then raise exception 'no es tu duelo'; end if;
  if d.status <> 'open' then raise exception 'ese duelo ya se jugó'; end if;

  if d.stake_coins > 0 then
    select coins into v_coins from public.profiles where id = v_user for update;
    update public.profiles set coins = coins + d.stake_coins where id = v_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_user, d.stake_coins, 'duel_refund', p_id::text, v_coins + d.stake_coins);
  end if;
  if d.challenger_card is not null then
    update public.player_cards set status = 'in_club' where id = d.challenger_card;
  end if;

  update public.penalty_duels set status = 'cancelled' where id = p_id;
end; $$;
revoke all on function public.duel_cancel(uuid) from public;
grant execute on function public.duel_cancel(uuid) to authenticated;

-- ------------------------------------------------------------
-- ¿La zona del disparo cae en las que cubre el arquero?
-- El arquero elige una zona base y cubre esa y las contiguas,
-- tantas como le permita su nivel.
-- ------------------------------------------------------------
create or replace function public._zone_covered(p_shot int, p_dive int, p_zones int)
returns boolean language sql immutable as $$
  select exists (
    select 1 from generate_series(0, p_zones - 1) g
    where ((p_dive + g) % 8) = p_shot
  );
$$;

-- ------------------------------------------------------------
-- 5) Aceptar y resolver la tanda
-- ------------------------------------------------------------
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
-- 6) Consultas para la interfaz
-- ------------------------------------------------------------
create or replace function public.duels_open()
returns TABLE(
  "id" uuid, "challenger" uuid, "username" text, "club_name" text,
  "crest_club" text, "challenger_level" int, "stake_coins" bigint,
  "stake_rarity" text, "created_at" timestamptz, "is_mine" boolean
)
language sql stable security definer set search_path = public as $$
  select d.id, d.challenger, p.username, p.club_name, p.crest_club,
         d.challenger_level, d.stake_coins, d.stake_rarity, d.created_at,
         d.challenger = auth.uid()
  from public.penalty_duels d
  join public.profiles p on p.id = d.challenger
  where d.status = 'open'
  order by d.created_at desc
  limit 40;
$$;
grant execute on function public.duels_open() to authenticated;

create or replace function public.duels_history()
returns TABLE(
  "id" uuid, "rival_name" text, "rival_crest" text,
  "my_score" int, "rival_score" int, "won" boolean,
  "stake_coins" bigint, "stake_rarity" text, "played_at" timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id,
         case when d.challenger = auth.uid() then po.club_name else pc.club_name end,
         case when d.challenger = auth.uid() then po.crest_club else pc.crest_club end,
         case when d.challenger = auth.uid() then d.challenger_score else d.opponent_score end,
         case when d.challenger = auth.uid() then d.opponent_score else d.challenger_score end,
         d.winner = auth.uid(),
         d.stake_coins, d.stake_rarity, d.played_at
  from public.penalty_duels d
  left join public.profiles pc on pc.id = d.challenger
  left join public.profiles po on po.id = d.opponent
  where d.status = 'done'
    and (d.challenger = auth.uid() or d.opponent = auth.uid())
  order by d.played_at desc
  limit 20;
$$;
grant execute on function public.duels_history() to authenticated;

-- Cartas que se pueden apostar, por rareza
create or replace function public.wagerable_cards(p_rarity text default null)
returns TABLE(
  "card_id" uuid, "player_name" text, "overall" int,
  "position" text, "rarity" text, "club_name" text
)
language sql stable security definer set search_path = public as $$
  select c.id, i.name, t.overall, t.position, t.rarity, i.club_name
  from public.player_cards c
  join public.player_templates t on t.id = c.template_id
  join public.player_identities i on i.id = t.identity_id
  where c.owner_id = auth.uid()
    and c.status = 'in_club'
    and not c.bound
    and c.injury_matches_left = 0
    and (p_rarity is null or t.rarity = p_rarity)
    and not exists (
      select 1 from public.squad_slots s
      where s.user_id = auth.uid() and s.card_id = c.id
    )
  order by t.overall desc
  limit 60;
$$;
grant execute on function public.wagerable_cards(text) to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  public.keeper_zones(0)   as zonas_nivel_parejo,
  public.keeper_zones(-20) as zonas_muy_inferior,
  public.keeper_zones(20)  as zonas_muy_superior,
  (select count(*) from public.penalty_duels) as duelos;
