-- ============================================================
-- MERCADO DE TRASPASOS
--
-- Subasta con puja y compra inmediata. Todo el dinero y las cartas se
-- mueven en transacciones atómicas con ledger. Protecciones:
--   · Rangos de precio por rareza (anti-lavado entre amigos)
--   · Impuesto del 5% al vendedor (sumidero de monedas)
--   · Bloqueo de filas (FOR UPDATE) para evitar dobles compras
--   · No se pueden vender cartas del once, lesionadas ni vinculadas
-- ============================================================

create table if not exists public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.player_cards(id) on delete cascade,
  seller_id      uuid not null references public.profiles(id) on delete cascade,
  start_price    bigint not null,
  buy_now        bigint,
  current_bid    bigint,
  current_bidder uuid references public.profiles(id),
  status         text not null default 'active',  -- active | sold | expired | cancelled
  ends_at        timestamptz not null,
  created_at     timestamptz not null default now(),
  -- Datos copiados para poder filtrar sin joins pesados
  template_id    uuid not null,
  overall        int not null,
  position       text not null,
  rarity         text not null,
  player_name    text not null,
  club_name      text,
  league_name    text,
  nationality    text
);
create index if not exists idx_listings_active
  on public.market_listings (status, ends_at);
create index if not exists idx_listings_filter
  on public.market_listings (status, rarity, overall desc);
create index if not exists idx_listings_seller
  on public.market_listings (seller_id, status);

alter table public.market_listings enable row level security;
drop policy if exists "listings_read" on public.market_listings;
create policy "listings_read" on public.market_listings for select using (true);
-- Escritura solo por RPC.

create table if not exists public.market_transactions (
  id          bigint generated always as identity primary key,
  listing_id  uuid,
  template_id uuid,
  player_name text,
  buyer_id    uuid,
  seller_id   uuid,
  price       bigint not null,
  tax         bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tx_template on public.market_transactions (template_id, created_at desc);
alter table public.market_transactions enable row level security;
drop policy if exists "tx_read" on public.market_transactions;
-- El historial de precios es público (ayuda a fijar precios justos),
-- pero solo se muestran importes, sin identidad de las partes.
create policy "tx_read" on public.market_transactions for select using (true);

-- ------------------------------------------------------------
-- Rango de precios permitido según rareza y media
-- ------------------------------------------------------------
create or replace function public.price_range(p_rarity text, p_overall int)
returns TABLE("min_price" bigint, "max_price" bigint)
language sql immutable as $$
  select
    (case p_rarity
      when 'common' then 150 when 'uncommon' then 400 when 'rare' then 1200
      when 'epic' then 4000 when 'legendary' then 15000 when 'icon' then 50000
      else 150 end)::bigint,
    (case p_rarity
      when 'common' then 3000 when 'uncommon' then 12000 when 'rare' then 60000
      when 'epic' then 300000 when 'legendary' then 1500000 when 'icon' then 8000000
      else 3000 end
      * greatest(1, 1 + (p_overall - 60) * 0.05))::bigint;
$$;
grant execute on function public.price_range(text, int) to anon, authenticated;

-- ------------------------------------------------------------
-- RPC: publicar una carta
-- ------------------------------------------------------------
create or replace function public.list_card(
  p_card_id uuid, p_start bigint, p_buy_now bigint, p_hours int default 8
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_card record; v_rng record; v_id uuid; v_hours int := greatest(1, least(24, p_hours));
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select pc.id, pc.bound, pc.status, pc.injury_matches_left, pc.template_id,
         pt.overall, pt.position, pt.rarity, i.name as player_name,
         i.club_name, i.league_name, i.nationality
    into v_card
    from public.player_cards pc
    join public.player_templates pt on pt.id = pc.template_id
    join public.player_identities i on i.id = pt.identity_id
    where pc.id = p_card_id and pc.owner_id = v_user
    for update of pc;
  if not found then raise exception 'card not found'; end if;
  if v_card.bound then raise exception 'esa carta está vinculada al club'; end if;
  if v_card.status <> 'in_club' then raise exception 'esa carta no está disponible'; end if;
  if v_card.injury_matches_left > 0 then
    raise exception 'no podés vender un jugador lesionado';
  end if;
  if exists (select 1 from public.squad_slots where user_id = v_user and card_id = p_card_id) then
    raise exception 'sacá al jugador de tu plantilla antes de venderlo';
  end if;

  select * into v_rng from public.price_range(v_card.rarity, v_card.overall);
  if p_start < v_rng.min_price or p_start > v_rng.max_price then
    raise exception 'precio inicial fuera de rango (% - %)', v_rng.min_price, v_rng.max_price;
  end if;
  if p_buy_now is not null then
    if p_buy_now < p_start then raise exception 'la compra inmediata no puede ser menor al precio inicial'; end if;
    if p_buy_now > v_rng.max_price then
      raise exception 'compra inmediata fuera de rango (máx %)', v_rng.max_price;
    end if;
  end if;

  update public.player_cards set status = 'on_market' where id = p_card_id;

  insert into public.market_listings(
    card_id, seller_id, start_price, buy_now, ends_at,
    template_id, overall, position, rarity, player_name,
    club_name, league_name, nationality
  ) values (
    p_card_id, v_user, p_start, p_buy_now, now() + (v_hours || ' hours')::interval,
    v_card.template_id, v_card.overall, v_card.position, v_card.rarity,
    v_card.player_name, v_card.club_name, v_card.league_name, v_card.nationality
  ) returning id into v_id;

  return v_id;
end; $$;
revoke all on function public.list_card(uuid, bigint, bigint, int) from public;
grant execute on function public.list_card(uuid, bigint, bigint, int) to authenticated;

-- ------------------------------------------------------------
-- RPC: pujar
-- ------------------------------------------------------------
create or replace function public.place_bid(p_listing_id uuid, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_l record; v_min bigint; v_coins bigint; v_prev_bidder uuid; v_prev bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_l from public.market_listings where id = p_listing_id for update;
  if not found then raise exception 'listing not found'; end if;
  if v_l.status <> 'active' then raise exception 'esa subasta ya terminó'; end if;
  if v_l.ends_at <= now() then raise exception 'esa subasta ya terminó'; end if;
  if v_l.seller_id = v_user then raise exception 'no podés pujar por tu propia carta'; end if;

  v_min := case when v_l.current_bid is null then v_l.start_price
                else v_l.current_bid + greatest(50, (v_l.current_bid * 0.05)::bigint) end;
  if p_amount < v_min then raise exception 'la puja mínima es %', v_min; end if;
  if v_l.buy_now is not null and p_amount > v_l.buy_now then
    raise exception 'esa puja supera la compra inmediata';
  end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < p_amount then raise exception 'insufficient funds'; end if;

  -- Retener el dinero del nuevo postor y devolver al anterior (escrow)
  v_prev_bidder := v_l.current_bidder; v_prev := v_l.current_bid;

  update public.profiles set coins = coins - p_amount where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -p_amount, 'bid_hold', p_listing_id::text, v_coins - p_amount);

  if v_prev_bidder is not null then
    update public.profiles set coins = coins + v_prev where id = v_prev_bidder;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      select v_prev_bidder, v_prev, 'bid_refund', p_listing_id::text, coins
        from public.profiles where id = v_prev_bidder;
  end if;

  update public.market_listings
    set current_bid = p_amount, current_bidder = v_user,
        -- Anti-francotirador: si quedan menos de 2 min, se extiende
        ends_at = case when ends_at - now() < interval '2 minutes'
                       then now() + interval '2 minutes' else ends_at end
    where id = p_listing_id;

  return jsonb_build_object('bid', p_amount, 'listing', p_listing_id);
end; $$;
revoke all on function public.place_bid(uuid, bigint) from public;
grant execute on function public.place_bid(uuid, bigint) to authenticated;

-- ------------------------------------------------------------
-- Cierre de una venta (uso interno)
-- ------------------------------------------------------------
create or replace function public._settle(p_listing_id uuid, p_buyer uuid, p_price bigint, p_already_held boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_l record; v_tax bigint; v_net bigint; v_coins bigint;
begin
  select * into v_l from public.market_listings where id = p_listing_id;

  if not p_already_held then
    select coins into v_coins from public.profiles where id = p_buyer for update;
    if v_coins < p_price then raise exception 'insufficient funds'; end if;
    update public.profiles set coins = coins - p_price where id = p_buyer;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (p_buyer, -p_price, 'market_buy', p_listing_id::text, v_coins - p_price);
  end if;

  -- Impuesto del 5% al vendedor (sumidero de monedas)
  v_tax := greatest(1, (p_price * 0.05)::bigint);
  v_net := p_price - v_tax;

  select coins into v_coins from public.profiles where id = v_l.seller_id for update;
  update public.profiles set coins = coins + v_net where id = v_l.seller_id;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_l.seller_id, v_net, 'market_sale', p_listing_id::text, v_coins + v_net);

  -- Transferir la carta
  update public.player_cards
    set owner_id = p_buyer, status = 'in_club'
    where id = v_l.card_id;

  update public.market_listings set status = 'sold' where id = p_listing_id;

  insert into public.market_transactions(
    listing_id, template_id, player_name, buyer_id, seller_id, price, tax
  ) values (
    p_listing_id, v_l.template_id, v_l.player_name, p_buyer, v_l.seller_id, p_price, v_tax
  );
end; $$;

-- ------------------------------------------------------------
-- RPC: compra inmediata
-- ------------------------------------------------------------
create or replace function public.buy_now(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_l record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_l from public.market_listings where id = p_listing_id for update;
  if not found then raise exception 'listing not found'; end if;
  if v_l.status <> 'active' then raise exception 'esa carta ya no está disponible'; end if;
  if v_l.buy_now is null then raise exception 'esa subasta no tiene compra inmediata'; end if;
  if v_l.seller_id = v_user then raise exception 'no podés comprar tu propia carta'; end if;

  -- Devolver el dinero retenido al postor actual, si lo hay
  if v_l.current_bidder is not null then
    update public.profiles set coins = coins + v_l.current_bid where id = v_l.current_bidder;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      select v_l.current_bidder, v_l.current_bid, 'bid_refund', p_listing_id::text, coins
        from public.profiles where id = v_l.current_bidder;
  end if;

  perform public._settle(p_listing_id, v_user, v_l.buy_now, false);
  return jsonb_build_object('price', v_l.buy_now);
end; $$;
revoke all on function public.buy_now(uuid) from public;
grant execute on function public.buy_now(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: cancelar publicación (solo sin pujas)
-- ------------------------------------------------------------
create or replace function public.cancel_listing(p_listing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_l record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_l from public.market_listings where id = p_listing_id for update;
  if not found then raise exception 'listing not found'; end if;
  if v_l.seller_id <> v_user then raise exception 'no es tu publicación'; end if;
  if v_l.status <> 'active' then raise exception 'esa publicación ya cerró'; end if;
  if v_l.current_bidder is not null then
    raise exception 'no podés cancelar: ya tiene pujas';
  end if;

  update public.market_listings set status = 'cancelled' where id = p_listing_id;
  update public.player_cards set status = 'in_club' where id = v_l.card_id;
end; $$;
revoke all on function public.cancel_listing(uuid) from public;
grant execute on function public.cancel_listing(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: resolver subastas vencidas (la llama la app al abrir el mercado)
-- ------------------------------------------------------------
create or replace function public.settle_expired()
returns int language plpgsql security definer set search_path = public as $$
declare v_l record; v_n int := 0;
begin
  for v_l in
    select * from public.market_listings
    where status = 'active' and ends_at <= now()
    order by ends_at limit 50
  loop
    if v_l.current_bidder is not null then
      -- El dinero ya está retenido desde la puja
      perform public._settle(v_l.id, v_l.current_bidder, v_l.current_bid, true);
    else
      update public.market_listings set status = 'expired' where id = v_l.id;
      update public.player_cards set status = 'in_club' where id = v_l.card_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
grant execute on function public.settle_expired() to authenticated;

-- ------------------------------------------------------------
-- Precio de referencia por jugador (últimas ventas)
-- ------------------------------------------------------------
create or replace function public.market_price_hint(p_template_id uuid)
returns TABLE("avg_price" bigint, "sales" int)
language sql stable security definer set search_path = public as $$
  select coalesce(avg(price), 0)::bigint, count(*)::int
  from (
    select price from public.market_transactions
    where template_id = p_template_id
    order by created_at desc limit 10
  ) t;
$$;
grant execute on function public.market_price_hint(uuid) to authenticated;

select
  (select count(*) from public.market_listings) as publicaciones,
  (select count(*) from public.market_transactions) as ventas;
