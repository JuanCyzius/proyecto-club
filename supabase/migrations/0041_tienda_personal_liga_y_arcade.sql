-- ============================================================
-- 1. TIENDA DE JUGADORES POR USUARIO (antes era global)
--    Cada club ve SUS 3 jugadores al azar; rotan cada 2 horas.
--    Así circulan más jugadores distintos entre todos.
-- 2. REINICIO DE LIGA: rating, división y stats ranked a cero
--    para todos, para arrancar parejos con el PvP nuevo.
-- 3. PvP ARCADE: récord (W-E-L y racha) por usuario + ranking.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tienda por usuario (se recrea la tabla del prototipo global)
-- ------------------------------------------------------------
drop table if exists public.market_shop_purchases;
drop table if exists public.market_shop_slots;

create table public.market_shop_slots (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  slot        int not null check (slot between 1 and 3),
  template_id uuid not null references public.player_templates(id),
  price       bigint not null,
  rotation    bigint not null,
  unique (user_id, rotation, slot)
);
alter table public.market_shop_slots enable row level security;
create policy "shop_slots_own" on public.market_shop_slots
  for select using (auth.uid() = user_id);

create table public.market_shop_purchases (
  slot_id bigint primary key references public.market_shop_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade
);
alter table public.market_shop_purchases enable row level security;
create policy "shop_purchases_own" on public.market_shop_purchases
  for select using (auth.uid() = user_id);

create or replace function public.market_shop()
returns TABLE(
  "slot_id" bigint, "slot" int, "name" text, "position" text,
  "overall" int, "rarity" text, "club_name" text, "nationality" text,
  "price" bigint, "expires_in_min" int, "already_bought" boolean
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rot bigint := floor(extract(epoch from now()) / 7200)::bigint;
  v_slot int; v_rarity text; v_tpl uuid; v_ov int;
begin
  if v_user is null then return; end if;

  if not exists (select 1 from public.market_shop_slots s
                 where s.user_id = v_user and s.rotation = v_rot) then
    for v_slot in 1..3 loop
      v_rarity := public._shop_roll_rarity();
      select t.id, t.overall into v_tpl, v_ov
        from public.player_templates t
        where t.rarity = v_rarity order by random() limit 1;
      if v_tpl is null then
        select t.id, t.overall into v_tpl, v_ov
          from public.player_templates t order by random() limit 1;
      end if;
      insert into public.market_shop_slots (user_id, slot, template_id, price, rotation)
        values (v_user, v_slot, v_tpl, public.market_shop_price(v_ov), v_rot)
        on conflict do nothing;
    end loop;
  end if;

  return query
    select s.id, s.slot, i.name, t.position::text, t.overall, t.rarity::text,
           i.club_name, i.nationality, s.price,
           (((v_rot + 1) * 7200 - extract(epoch from now())) / 60)::int,
           exists (select 1 from public.market_shop_purchases p where p.slot_id = s.id)
    from public.market_shop_slots s
    join public.player_templates t on t.id = s.template_id
    join public.player_identities i on i.id = t.identity_id
    where s.user_id = v_user and s.rotation = v_rot
    order by s.slot;
end; $$;
grant execute on function public.market_shop() to authenticated;

create or replace function public.market_shop_buy(p_slot_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); s record; v_coins bigint; v_card uuid;
  v_rot bigint := floor(extract(epoch from now()) / 7200)::bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into s from public.market_shop_slots where id = p_slot_id for update;
  if not found or s.user_id <> v_user or s.rotation <> v_rot then
    raise exception 'esa oferta ya venció, la tienda rotó';
  end if;
  if exists (select 1 from public.market_shop_purchases where slot_id = p_slot_id) then
    raise exception 'ya compraste ese jugador en esta rotación';
  end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < s.price then raise exception 'insufficient funds'; end if;

  insert into public.market_shop_purchases (slot_id, user_id) values (p_slot_id, v_user);
  update public.profiles set coins = coins - s.price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -s.price, 'shop_buy', p_slot_id::text, v_coins - s.price);

  insert into public.player_cards (template_id, owner_id)
    values (s.template_id, v_user) returning id into v_card;

  return jsonb_build_object('card_id', v_card, 'price', s.price);
end; $$;
revoke all on function public.market_shop_buy(bigint) from public;
grant execute on function public.market_shop_buy(bigint) to authenticated;

-- ------------------------------------------------------------
-- 2) Reinicio de liga: todos parejos
-- ------------------------------------------------------------
update public.profiles set
  rating = 1000, division = 10, ranked_played = 0, ranked_won = 0;
-- ------------------------------------------------------------
-- 3) PvP ARCADE: la liga reiniciada ES la liga del arcade.
--    Cada partido mueve el rating (Elo contra un bot de 1000) y la
--    división; victorias y jugados van a ranked_won/ranked_played.
--    Prototipo: lo reporta el cliente con el resultado acotado; con el
--    server autoritativo del online, esto se resuelve en el servidor.
-- ------------------------------------------------------------
create or replace function public.arcade_report(p_my int, p_rival int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_r int; v_e numeric; v_s numeric; v_d int; v_n int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_my < 0 or p_rival < 0 or p_my > 30 or p_rival > 30 then
    raise exception 'resultado inválido';
  end if;

  select rating into v_r from public.profiles where id = v_user for update;
  v_e := 1.0 / (1.0 + power(10, (1000 - v_r) / 400.0));
  v_s := case when p_my > p_rival then 1 when p_my = p_rival then 0.5 else 0 end;
  v_d := round(24 * (v_s - v_e))::int;
  v_n := greatest(100, v_r + v_d);

  update public.profiles set
    rating = v_n,
    ranked_played = ranked_played + 1,
    ranked_won = ranked_won + case when p_my > p_rival then 1 else 0 end,
    division = greatest(1, least(10, 10 - floor((v_n - 800) / 150)::int))
    where id = v_user;

  return v_n - v_r;
end; $$;
revoke all on function public.arcade_report(int, int) from public;
grant execute on function public.arcade_report(int, int) to authenticated;

create or replace function public.arcade_top()
returns TABLE("club_name" text, "rating" int)
language sql stable security definer set search_path = public as $$
  select p.club_name, p.rating from public.profiles p
  where p.ranked_played > 0
  order by p.rating desc limit 20;
$$;
grant execute on function public.arcade_top() to authenticated;

select 'tienda por usuario · liga reiniciada · arcade con rating listo' as resultado;
