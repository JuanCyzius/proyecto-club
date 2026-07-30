-- ============================================================
-- ESCUDOS DE CLUB + PROBABILIDADES MÁS DURAS
--
-- 1. Antes del plantel inicial se abre un sobre con 4 escudos para
--    elegir la identidad del club.
-- 2. Los sobres normales también pueden entregar escudos, que quedan
--    guardados para personalizar el club cuando uno quiera.
-- 3. Se bajan las probabilidades de las rarezas altas: un Especial
--    pasa de garantizar un épico (97%) a un 67%, y un legendario de
--    61% a 14%.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Escudos que posee cada usuario
-- ------------------------------------------------------------
create table if not exists public.user_crests (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  club_name  text not null references public.club_assets(club_name) on delete cascade,
  obtained_at timestamptz not null default now(),
  primary key (user_id, club_name)
);
create index if not exists idx_user_crests on public.user_crests (user_id);
alter table public.user_crests enable row level security;
drop policy if exists "user_crests_own" on public.user_crests;
create policy "user_crests_own" on public.user_crests
  for select using (auth.uid() = user_id);

-- Escudo elegido para el club
alter table public.profiles
  add column if not exists crest_club text,
  add column if not exists crest_chosen boolean not null default false;

-- La vista pública muestra el escudo (se ve en tablas y rivales)
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id, username, club_name, level, division, rating,
         ranked_played, ranked_won, crest_club
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Sobre de bienvenida de escudos: 4 opciones al azar
-- ------------------------------------------------------------
create or replace function public.draw_starter_crests()
returns TABLE("club_name" text, "logo_path" text)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Si ya eligió, devolver el suyo (la pantalla no debe volver a pedirlo)
  if exists (select 1 from public.profiles p
             where p.id = v_user and p.crest_chosen) then
    raise exception 'ya elegiste el escudo de tu club';
  end if;

  -- Si ya se sortearon opciones y no eligió, se mantienen las mismas:
  -- así no puede recargar hasta que salgan los escudos que quiere.
  if exists (select 1 from public.user_crests c where c.user_id = v_user) then
    return query
      select c.club_name, a.logo_path
      from public.user_crests c
      join public.club_assets a on a.club_name = c.club_name
      where c.user_id = v_user
      order by c.club_name;
    return;
  end if;

  insert into public.user_crests (user_id, club_name)
  select v_user, a.club_name
  from public.club_assets a
  order by random()
  limit 4;

  return query
    select c.club_name, a.logo_path
    from public.user_crests c
    join public.club_assets a on a.club_name = c.club_name
    where c.user_id = v_user
    order by c.club_name;
end; $$;
revoke all on function public.draw_starter_crests() from public;
grant execute on function public.draw_starter_crests() to authenticated;

-- ------------------------------------------------------------
-- 3) Elegir el escudo del club (entre los que uno tiene)
-- ------------------------------------------------------------
create or replace function public.set_club_crest(p_club text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.user_crests
    where user_id = v_user and club_name = p_club
  ) then
    raise exception 'no tenés ese escudo';
  end if;

  update public.profiles
    set crest_club = p_club, crest_chosen = true
    where id = v_user;
end; $$;
revoke all on function public.set_club_crest(text) from public;
grant execute on function public.set_club_crest(text) to authenticated;

-- Escudos del usuario, para la pantalla de personalización
create or replace function public.my_crests()
returns TABLE("club_name" text, "logo_path" text, "selected" boolean)
language sql stable security definer set search_path = public as $$
  select c.club_name, a.logo_path,
         (p.crest_club = c.club_name) as selected
  from public.user_crests c
  join public.club_assets a on a.club_name = c.club_name
  join public.profiles p on p.id = c.user_id
  where c.user_id = auth.uid()
  order by (p.crest_club = c.club_name) desc, c.obtained_at desc;
$$;
grant execute on function public.my_crests() to authenticated;

-- ------------------------------------------------------------
-- 4) Probabilidades más duras + escudos dentro de los sobres
-- ------------------------------------------------------------
update public.packs set
  description = '10 objetos: jugadores, ítems y a veces un escudo.',
  drop_table = '{
    "size": 10,
    "items": {"count": 2, "pool": {"stam_10": 55, "heal_1": 30, "stam_20": 12, "heal_2": 3}},
    "crests": {"chance": 0.18},
    "weights": {"common": 82, "uncommon": 16, "rare": 1.8, "epic": 0.2, "legendary": 0, "icon": 0},
    "guaranteed": []
  }'::jsonb
where code = 'bronze';

update public.packs set
  description = '10 objetos, con al menos un jugador poco común.',
  drop_table = '{
    "size": 10,
    "items": {"count": 2, "pool": {"stam_10": 40, "stam_20": 28, "heal_1": 20, "heal_2": 10, "stam_30": 2}},
    "crests": {"chance": 0.28},
    "weights": {"common": 58, "uncommon": 33, "rare": 8, "epic": 0.9, "legendary": 0.1, "icon": 0.01},
    "guaranteed": [{"minRarity": "uncommon"}]
  }'::jsonb
where code = 'silver';

update public.packs set
  description = '7 objetos de nivel alto, con al menos un jugador raro.',
  drop_table = '{
    "size": 7,
    "items": {"count": 2, "pool": {"stam_20": 35, "heal_2": 30, "stam_30": 20, "heal_3": 15}},
    "crests": {"chance": 0.40},
    "weights": {"common": 30, "uncommon": 40, "rare": 24, "epic": 5.5, "legendary": 0.45, "icon": 0.05},
    "guaranteed": [{"minRarity": "rare"}]
  }'::jsonb
where code = 'gold';

update public.packs set
  description = '7 objetos de élite, con al menos un jugador raro asegurado.',
  drop_table = '{
    "size": 7,
    "items": {"count": 2, "pool": {"heal_3": 40, "stam_30": 35, "heal_2": 15, "stam_20": 10}},
    "crests": {"chance": 0.55},
    "weights": {"common": 8, "uncommon": 32, "rare": 40, "epic": 17, "legendary": 2.7, "icon": 0.3},
    "guaranteed": [{"minRarity": "rare"}]
  }'::jsonb
where code = 'special';

-- ------------------------------------------------------------
-- 5) open_pack v4: jugadores + ítems + escudos
-- ------------------------------------------------------------
create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_items jsonb; v_item_count int; v_item_pool jsonb; v_crest_chance numeric;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text;
  v_tpl record; v_new uuid; v_total int; v_off int;
  v_players int; v_code text; v_it record;
  v_wtotal numeric; v_r numeric; v_acc numeric; v_crest record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if exists (
    select 1 from public.pack_openings
    where user_id = v_user and results->>'idem' = p_idem
  ) then
    raise exception 'duplicate operation';
  end if;

  select * into v_pack from public.packs where id = p_pack_id and active;
  if not found then raise exception 'pack not available'; end if;

  v_size := coalesce((v_pack.drop_table->>'size')::int, 5);
  v_weights := v_pack.drop_table->'weights';
  v_guaranteed := coalesce(v_pack.drop_table->'guaranteed', '[]'::jsonb);
  v_items := v_pack.drop_table->'items';
  v_item_count := coalesce((v_items->>'count')::int, 0);
  v_item_pool := v_items->'pool';
  v_crest_chance := coalesce((v_pack.drop_table->'crests'->>'chance')::numeric, 0);
  v_players := greatest(1, v_size - v_item_count);
  v_price := coalesce(v_pack.price_coins, 0);

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'pack_buy', p_pack_id::text, v_coins - v_price);

  -- ---------- Escudo (ocupa un espacio de jugador si sale) ----------
  if v_crest_chance > 0 and random() < v_crest_chance then
    select a.club_name, a.logo_path into v_crest
    from public.club_assets a
    where not exists (
      select 1 from public.user_crests c
      where c.user_id = v_user and c.club_name = a.club_name
    )
    order by random() limit 1;

    if v_crest.club_name is not null then
      insert into public.user_crests (user_id, club_name)
        values (v_user, v_crest.club_name)
        on conflict do nothing;
      v_results := v_results || jsonb_build_object(
        'kind', 'crest',
        'club_name', v_crest.club_name,
        'logo_path', v_crest.logo_path
      );
      v_players := greatest(1, v_players - 1);
    end if;
  end if;

  -- ---------- Jugadores ----------
  for i in 0..(v_players - 1) loop
    v_wslot := v_weights;
    if i < jsonb_array_length(v_guaranteed) then
      v_minr := v_guaranteed->i->>'minRarity';
      if v_minr is not null then
        v_wslot := public._filter_weights(v_weights, v_minr);
      end if;
    end if;
    v_rarity := public._pick_rarity(v_wslot);

    select total into v_total from public.rarity_counts where rarity = v_rarity;
    if v_total is null or v_total = 0 then
      v_rarity := 'common';
      select total into v_total from public.rarity_counts where rarity = 'common';
    end if;
    v_off := floor(random() * greatest(coalesce(v_total, 1), 1))::int;

    select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
           pt.attributes, pt.gk_attributes
      into v_tpl
      from public.player_templates pt
      where pt.rarity = v_rarity
      order by pt.id offset v_off limit 1;

    if v_tpl.id is null then
      select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
             pt.attributes, pt.gk_attributes
        into v_tpl
        from public.player_templates pt
        where pt.rarity = v_rarity order by pt.id limit 1;
    end if;
    if v_tpl.id is null then
      raise exception 'no hay jugadores en el catálogo (importá el CSV)';
    end if;

    insert into public.player_cards(template_id, owner_id)
      values (v_tpl.id, v_user) returning id into v_new;

    v_results := v_results || jsonb_build_object(
      'kind', 'player',
      'card_id', v_new,
      'template_id', v_tpl.id,
      'rarity', v_tpl.rarity,
      'overall', v_tpl.overall,
      'position', v_tpl.position,
      'attributes', v_tpl.attributes,
      'gk_attributes', v_tpl.gk_attributes,
      'name', (select name from public.player_identities where id = v_tpl.identity_id),
      'club_name', (select club_name from public.player_identities where id = v_tpl.identity_id),
      'nationality', (select nationality from public.player_identities where id = v_tpl.identity_id)
    );
  end loop;

  -- ---------- Ítems ----------
  if v_item_count > 0 and v_item_pool is not null then
    select coalesce(sum(value::numeric), 0) into v_wtotal
      from jsonb_each_text(v_item_pool);

    if v_wtotal > 0 then
      for i in 1..v_item_count loop
        v_r := random() * v_wtotal;
        v_acc := 0;
        v_code := null;
        for v_it in
          select key as code, value::numeric as w
          from jsonb_each_text(v_item_pool) order by key
        loop
          v_acc := v_acc + v_it.w;
          if v_r <= v_acc then v_code := v_it.code; exit; end if;
        end loop;
        if v_code is null then
          select key into v_code from jsonb_each_text(v_item_pool) order by key limit 1;
        end if;

        select * into v_it from public.items where code = v_code;
        if found then
          insert into public.user_items(user_id, item_code, qty)
            values (v_user, v_code, 1)
            on conflict (user_id, item_code)
            do update set qty = public.user_items.qty + 1;

          v_results := v_results || jsonb_build_object(
            'kind', 'item', 'code', v_it.code, 'name', v_it.name,
            'description', v_it.description, 'item_kind', v_it.kind,
            'power', v_it.power, 'rarity', v_it.rarity
          );
        end if;
      end loop;
    end if;
  end if;

  insert into public.pack_openings(user_id, pack_id, seed, results)
    values (v_user, p_pack_id, v_seed,
      jsonb_build_object('idem', p_idem, 'seed', v_seed, 'cards', v_results));

  return jsonb_build_object('cards', v_results, 'seed', v_seed);
end; $$;
revoke all on function public.open_pack(uuid, text) from public;
grant execute on function public.open_pack(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6) El plantel inicial exige haber elegido escudo primero
-- ------------------------------------------------------------
create or replace function public.claim_welcome()
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_templates int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.profiles where id = v_user and crest_chosen) then
    raise exception 'elegí primero el escudo de tu club';
  end if;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if;

  select count(*) into v_templates from public.player_templates;
  if v_templates = 0 then
    raise exception 'catalog empty: importá primero el CSV';
  end if;

  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from (
       select id from public.player_templates
       where position = 'GK' and overall between 62 and 72 limit 80
     ) t order by random() limit 2)
    union all
    (select t.id from (
       select id from public.player_templates
       where position in ('CB','RB','LB','RWB','LWB') and overall between 62 and 72 limit 250
     ) t order by random() limit 6)
    union all
    (select t.id from (
       select id from public.player_templates
       where position in ('CDM','CM','CAM','RM','LM') and overall between 62 and 72 limit 250
     ) t order by random() limit 6)
    union all
    (select t.id from (
       select id from public.player_templates
       where position in ('RW','LW','CF','ST') and overall between 62 and 72 limit 200
     ) t order by random() limit 3)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  return v_count;
end; $$;
revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.club_assets)                  as escudos_disponibles,
  (select count(*) from public.user_crests)                  as escudos_repartidos,
  (select count(*) from public.profiles where crest_chosen)  as clubes_con_escudo;
