-- ============================================================
-- TIENDA DE JUGADORES (Mercado → "Comprar jugadores")
--
-- 3 jugadores al azar que rotan cada 2 horas, iguales para todos.
-- Rarezas sorteadas con los pesos del Sobre Especial (los cracks
-- salen poco, pero salen). Precio según la media:
--   60 → ~400 · 84 → ~20.000 · 91+ → tope 60.000
-- Cada usuario puede comprar cada jugador UNA vez por rotación.
-- ============================================================

create table if not exists public.market_shop_slots (
  id          bigint generated always as identity primary key,
  slot        int not null check (slot between 1 and 3),
  template_id uuid not null references public.player_templates(id),
  price       bigint not null,
  rotation    bigint not null,          -- epoch/7200: identifica la ventana de 2hs
  unique (rotation, slot)
);
alter table public.market_shop_slots enable row level security;
drop policy if exists "shop_slots_read" on public.market_shop_slots;
create policy "shop_slots_read" on public.market_shop_slots for select using (true);

create table if not exists public.market_shop_purchases (
  slot_id  bigint not null references public.market_shop_slots(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (slot_id, user_id)
);
alter table public.market_shop_purchases enable row level security;
drop policy if exists "shop_purchases_own" on public.market_shop_purchases;
create policy "shop_purchases_own" on public.market_shop_purchases
  for select using (auth.uid() = user_id);

-- Precio por media: curva exponencial 400 → 20.000 → tope 60.000.
create or replace function public.market_shop_price(p_overall int)
returns bigint language sql immutable as $$
  select least(60000,
    greatest(300,
      (round(400 * exp(0.163 * greatest(0, p_overall - 60)) / 50) * 50)::bigint
    ));
$$;

-- Sorteo de una rareza con los pesos del Sobre Especial.
create or replace function public._shop_roll_rarity()
returns text language sql volatile as $$
  with w(r, wt) as (values
    ('common', 8.0), ('uncommon', 32.0), ('rare', 40.0),
    ('epic', 17.0), ('legendary', 2.7), ('icon', 0.3)
  ), pick as (select random() * (select sum(wt) from w) as x)
  select r from (
    select r, sum(wt) over (order by r) as acc from w
  ) t, pick where acc >= pick.x order by acc limit 1;
$$;

-- Devuelve los 3 jugadores de la rotación actual; si la ventana de
-- 2hs cambió, sortea una nueva (con lock para evitar carreras).
create or replace function public.market_shop()
returns TABLE(
  "slot_id" bigint, "slot" int, "name" text, "position" text,
  "overall" int, "rarity" text, "club_name" text, "nationality" text,
  "price" bigint, "expires_in_min" int, "already_bought" boolean
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_rot bigint := floor(extract(epoch from now()) / 7200)::bigint;
  v_slot int; v_rarity text; v_tpl uuid; v_ov int;
begin
  if not exists (select 1 from public.market_shop_slots s where s.rotation = v_rot) then
    perform pg_advisory_xact_lock(918273);
    if not exists (select 1 from public.market_shop_slots s where s.rotation = v_rot) then
      for v_slot in 1..3 loop
        v_rarity := public._shop_roll_rarity();
        select t.id, t.overall into v_tpl, v_ov
          from public.player_templates t
          where t.rarity = v_rarity
          order by random() limit 1;
        -- Respaldo si no hay de esa rareza
        if v_tpl is null then
          select t.id, t.overall into v_tpl, v_ov
            from public.player_templates t order by random() limit 1;
        end if;
        insert into public.market_shop_slots (slot, template_id, price, rotation)
          values (v_slot, v_tpl, public.market_shop_price(v_ov), v_rot)
          on conflict do nothing;
      end loop;
    end if;
  end if;

  return query
    select s.id, s.slot, i.name, t.position::text, t.overall, t.rarity::text,
           i.club_name, i.nationality, s.price,
           (((v_rot + 1) * 7200 - extract(epoch from now())) / 60)::int,
           exists (select 1 from public.market_shop_purchases p
                   where p.slot_id = s.id and p.user_id = auth.uid())
    from public.market_shop_slots s
    join public.player_templates t on t.id = s.template_id
    join public.player_identities i on i.id = t.identity_id
    where s.rotation = v_rot
    order by s.slot;
end; $$;
grant execute on function public.market_shop() to authenticated;

-- Comprar uno de los 3 (una vez por usuario y rotación).
create or replace function public.market_shop_buy(p_slot_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); s record; v_coins bigint; v_card uuid;
  v_rot bigint := floor(extract(epoch from now()) / 7200)::bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into s from public.market_shop_slots where id = p_slot_id;
  if not found or s.rotation <> v_rot then
    raise exception 'esa oferta ya venció, la tienda rotó';
  end if;
  if exists (select 1 from public.market_shop_purchases
             where slot_id = p_slot_id and user_id = v_user) then
    raise exception 'ya compraste ese jugador en esta rotación';
  end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < s.price then raise exception 'insufficient funds'; end if;

  insert into public.market_shop_purchases (slot_id, user_id)
    values (p_slot_id, v_user);
  update public.profiles set coins = coins - s.price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -s.price, 'shop_buy', p_slot_id::text, v_coins - s.price);

  insert into public.player_cards (template_id, owner_id)
    values (s.template_id, v_user) returning id into v_card;

  return jsonb_build_object('card_id', v_card, 'price', s.price);
end; $$;
revoke all on function public.market_shop_buy(bigint) from public;
grant execute on function public.market_shop_buy(bigint) to authenticated;

-- Comprobación: precios de referencia
select o as media, public.market_shop_price(o) as precio
from unnest(array[60, 70, 78, 84, 88, 91, 95]) o;
