-- ============================================================
-- DRAFT MÁS EXIGENTE · RANKINGS · PLANTILLAS PÚBLICAS · DESCARTE
-- ============================================================

-- ------------------------------------------------------------
-- 1) Draft: premios más chicos (tope 10.000 en 5 victorias)
--    La entrada baja a 1.800 para que siga valiendo la pena jugarlo:
--    con 2 victorias se recupera, y el valor esperado queda apenas
--    positivo en vez de ser un negocio seguro.
-- ------------------------------------------------------------
update public.draft_config set
  entry_coins = 1800,
  rewards = '{
    "0": {"coins": 200,   "packs": []},
    "1": {"coins": 700,   "packs": []},
    "2": {"coins": 1800,  "packs": ["bronze"]},
    "3": {"coins": 3200,  "packs": ["bronze"]},
    "4": {"coins": 5500,  "packs": ["silver"]},
    "5": {"coins": 10000, "packs": ["gold"]}
  }'::jsonb
where id = 1;

-- ------------------------------------------------------------
-- 2) Rankings por periodo: partidos jugados y monedas ganadas
-- ------------------------------------------------------------
create index if not exists idx_matches_played_at
  on public.matches (played_at desc) where status = 'done';
create index if not exists idx_ledger_positive
  on public.coin_ledger (created_at desc) where delta > 0;

/**
 * p_metric: 'matches' | 'coins'
 * p_period: 'day' | 'week'
 * Devuelve el top 30 del periodo en curso.
 */
create or replace function public.period_ranking(
  p_metric text default 'matches',
  p_period text default 'week'
)
returns TABLE(
  "user_id" uuid,
  "username" text,
  "club_name" text,
  "crest_club" text,
  "value" bigint
)
language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz;
begin
  v_since := case when p_period = 'day'
                  then date_trunc('day', now())
                  else date_trunc('week', now()) end;

  if p_metric = 'coins' then
    return query
    select p.id, p.username, p.club_name, p.crest_club,
           coalesce(sum(l.delta), 0)::bigint as v
    from public.profiles p
    left join public.coin_ledger l
      on l.user_id = p.id and l.delta > 0 and l.created_at >= v_since
    group by p.id, p.username, p.club_name, p.crest_club
    having coalesce(sum(l.delta), 0) > 0
    order by v desc
    limit 30;
  else
    return query
    select p.id, p.username, p.club_name, p.crest_club,
           count(m.id)::bigint as v
    from public.profiles p
    left join public.matches m
      on m.status = 'done' and m.played_at >= v_since
     and (m.home_user = p.id or m.away_user = p.id)
    group by p.id, p.username, p.club_name, p.crest_club
    having count(m.id) > 0
    order by v desc
    limit 30;
  end if;
end; $$;
grant execute on function public.period_ranking(text, text) to authenticated;

-- ------------------------------------------------------------
-- 3) Ver la plantilla de otro club y su valor
-- ------------------------------------------------------------
create or replace function public.public_squad(p_user uuid)
returns TABLE(
  "slot" text,
  "player_name" text,
  "position" text,
  "overall" int,
  "rarity" text,
  "club_name" text,
  "nationality" text,
  "value_eur" bigint
)
language sql stable security definer set search_path = public as $$
  select s.slot, i.name, t.position, t.overall, t.rarity,
         i.club_name, i.nationality, t.value_eur
  from public.squad_slots s
  join public.player_cards c on c.id = s.card_id
  join public.player_templates t on t.id = c.template_id
  join public.player_identities i on i.id = t.identity_id
  where s.user_id = p_user and s.card_id is not null
  order by t.overall desc;
$$;
grant execute on function public.public_squad(uuid) to authenticated;

/** Resumen de un club ajeno: media del once, valor y tamaño del plantel. */
create or replace function public.club_summary(p_user uuid)
returns TABLE(
  "username" text,
  "club_name" text,
  "crest_club" text,
  "level" int,
  "division" int,
  "rating" int,
  "squad_size" int,
  "starters" int,
  "avg_overall" int,
  "squad_value" bigint,
  "best_overall" int
)
language sql stable security definer set search_path = public as $$
  select
    p.username, p.club_name, p.crest_club, p.level, p.division, p.rating,
    (select count(*)::int from public.player_cards c
      where c.owner_id = p.id and c.status = 'in_club'),
    (select count(*)::int from public.squad_slots s
      where s.user_id = p.id and s.card_id is not null
        and s.slot not like 'SUB%'),
    coalesce((
      select round(avg(t.overall))::int
      from public.squad_slots s
      join public.player_cards c on c.id = s.card_id
      join public.player_templates t on t.id = c.template_id
      where s.user_id = p.id and s.slot not like 'SUB%'
    ), 0),
    coalesce((
      select sum(t.value_eur)::bigint
      from public.player_cards c
      join public.player_templates t on t.id = c.template_id
      where c.owner_id = p.id and c.status = 'in_club'
    ), 0),
    coalesce((
      select max(t.overall)::int
      from public.player_cards c
      join public.player_templates t on t.id = c.template_id
      where c.owner_id = p.id and c.status = 'in_club'
    ), 0)
  from public.profiles p
  where p.id = p_user;
$$;
grant execute on function public.club_summary(uuid) to authenticated;

-- Listado de clubes para explorar
create or replace function public.list_clubs()
returns TABLE(
  "user_id" uuid, "username" text, "club_name" text,
  "crest_club" text, "level" int, "rating" int, "squad_value" bigint
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.club_name, p.crest_club, p.level, p.rating,
         coalesce((
           select sum(t.value_eur)::bigint
           from public.player_cards c
           join public.player_templates t on t.id = c.template_id
           where c.owner_id = p.id and c.status = 'in_club'
         ), 0)
  from public.profiles p
  where p.id <> auth.uid()
  order by p.rating desc
  limit 50;
$$;
grant execute on function public.list_clubs() to authenticated;

-- ------------------------------------------------------------
-- 4) Descartar varios jugadores de una vez
--    Mismo precio que la venta rápida, pero sin repetir el gesto
--    veinte veces. Nunca descarta titulares, lesionados ni vinculados.
-- ------------------------------------------------------------
create or replace function public.quick_sell_many(p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_card record; v_val bigint; v_total bigint := 0; v_n int := 0;
  v_coins bigint; i int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return jsonb_build_object('sold', 0, 'coins', 0);
  end if;
  if array_length(p_card_ids, 1) > 40 then
    raise exception 'como máximo 40 jugadores por vez';
  end if;

  for i in 1..array_length(p_card_ids, 1) loop
    select pc.id, pc.bound, pc.status, pc.injury_matches_left,
           pt.rarity, pt.overall
      into v_card
      from public.player_cards pc
      join public.player_templates pt on pt.id = pc.template_id
      where pc.id = p_card_ids[i] and pc.owner_id = v_user
      for update of pc;

    if not found then continue; end if;
    if v_card.bound or v_card.status <> 'in_club' then continue; end if;
    if v_card.injury_matches_left > 0 then continue; end if;
    if exists (select 1 from public.squad_slots
               where user_id = v_user and card_id = p_card_ids[i]) then
      continue;
    end if;

    v_val := case v_card.rarity
      when 'common' then 40 when 'uncommon' then 110 when 'rare' then 280
      when 'epic' then 750 when 'legendary' then 1800 when 'icon' then 4500
      else 40 end;
    v_val := v_val + greatest(0, v_card.overall - 60) * 5;

    delete from public.player_cards where id = p_card_ids[i];
    v_total := v_total + v_val;
    v_n := v_n + 1;
  end loop;

  if v_total > 0 then
    select coins into v_coins from public.profiles where id = v_user for update;
    update public.profiles set coins = coins + v_total where id = v_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_user, v_total, 'quick_sell', 'bulk:' || v_n::text,
              v_coins + v_total);
  end if;

  return jsonb_build_object('sold', v_n, 'coins', v_total);
end; $$;
revoke all on function public.quick_sell_many(uuid[]) from public;
grant execute on function public.quick_sell_many(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 5) Publicación rápida en el mercado: precio sugerido
--    Calcula un precio razonable a partir del valor real del jugador
--    y de las últimas ventas, siempre dentro del rango permitido.
-- ------------------------------------------------------------
create or replace function public.suggest_price(p_card_id uuid)
returns TABLE("start_price" bigint, "buy_now" bigint, "min_price" bigint, "max_price" bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_card record; v_rng record;
  v_hint bigint; v_base bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select pt.id as template_id, pt.rarity, pt.overall, pt.value_eur
    into v_card
    from public.player_cards pc
    join public.player_templates pt on pt.id = pc.template_id
    where pc.id = p_card_id and pc.owner_id = v_user;
  if not found then raise exception 'card not found'; end if;

  select * into v_rng from public.price_range(v_card.rarity, v_card.overall);

  -- Media de las últimas ventas del mismo jugador, si las hay
  select avg_price into v_hint
    from public.market_price_hint(v_card.template_id);

  if coalesce(v_hint, 0) > 0 then
    v_base := v_hint;
  else
    -- Sin historial: se deriva del valor real del jugador
    v_base := greatest(v_rng.min_price,
                       least(v_rng.max_price,
                             coalesce(v_card.value_eur, 0) / 400));
  end if;

  return query select
    greatest(v_rng.min_price, least(v_rng.max_price, (v_base * 0.85)::bigint)),
    greatest(v_rng.min_price, least(v_rng.max_price, (v_base * 1.25)::bigint)),
    v_rng.min_price,
    v_rng.max_price;
end; $$;
grant execute on function public.suggest_price(uuid) to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select entry_coins from public.draft_config where id = 1) as entrada_draft,
  (select (rewards->'5'->>'coins')::int from public.draft_config where id = 1) as premio_5_victorias;
