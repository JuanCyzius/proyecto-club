-- ============================================================
-- SOBRES AMPLIADOS: más contenido y con ítems dentro
--
-- Bronce  → 10 cosas (jugadores + ítems)
-- Plata   → 10 cosas, al menos 1 poco común
-- Oro     →  7 cosas de más nivel, al menos 1 raro
-- Especial→  7 cosas de alto nivel, al menos 1 épico
--
-- `items` en drop_table define cuántas de esas cosas son ítems y con
-- qué probabilidad sale cada uno.
-- ============================================================

update public.packs set
  description = '10 sobres. Jugadores e ítems para empezar.',
  price_coins = 700,
  drop_table = '{
    "size": 10,
    "items": {"count": 3, "pool": {"stam_10": 55, "heal_1": 30, "stam_20": 12, "heal_2": 3}},
    "weights": {"common": 70, "uncommon": 24, "rare": 5, "epic": 1, "legendary": 0, "icon": 0},
    "guaranteed": []
  }'::jsonb
where code = 'bronze';

update public.packs set
  description = '10 sobres, con al menos un jugador poco común.',
  price_coins = 1800,
  drop_table = '{
    "size": 10,
    "items": {"count": 3, "pool": {"stam_10": 40, "stam_20": 28, "heal_1": 20, "heal_2": 10, "stam_30": 2}},
    "weights": {"common": 45, "uncommon": 35, "rare": 15, "epic": 4, "legendary": 0.9, "icon": 0.1},
    "guaranteed": [{"minRarity": "uncommon"}]
  }'::jsonb
where code = 'silver';

update public.packs set
  description = '7 sobres de nivel alto, con al menos un jugador raro.',
  price_coins = 5000,
  drop_table = '{
    "size": 7,
    "items": {"count": 2, "pool": {"stam_20": 35, "heal_2": 30, "stam_30": 20, "heal_3": 15}},
    "weights": {"common": 20, "uncommon": 30, "rare": 32, "epic": 14, "legendary": 3.5, "icon": 0.5},
    "guaranteed": [{"minRarity": "rare"}]
  }'::jsonb
where code = 'gold';

update public.packs set
  description = '7 sobres de élite, con al menos un jugador épico.',
  price_coins = 15000,
  drop_table = '{
    "size": 7,
    "items": {"count": 2, "pool": {"heal_3": 40, "stam_30": 35, "heal_2": 15, "stam_20": 10}},
    "weights": {"common": 0, "uncommon": 15, "rare": 35, "epic": 33, "legendary": 14, "icon": 3},
    "guaranteed": [{"minRarity": "epic"}]
  }'::jsonb
where code = 'special';

-- ------------------------------------------------------------
-- open_pack v3: entrega jugadores E ítems
-- ------------------------------------------------------------
create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_items jsonb; v_item_count int; v_item_pool jsonb;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text;
  v_tpl record; v_new uuid; v_total int; v_off int;
  v_players int; v_code text; v_it record;
  v_wtotal numeric; v_r numeric; v_acc numeric;
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
  v_players := greatest(1, v_size - v_item_count);
  v_price := coalesce(v_pack.price_coins, 0);

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'pack_buy', p_pack_id::text, v_coins - v_price);

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
      'club_name', (select club_name from public.player_identities where id = v_tpl.identity_id)
    );
  end loop;

  -- ---------- Ítems ----------
  if v_item_count > 0 and v_item_pool is not null then
    select coalesce(sum(value::numeric), 0) into v_wtotal
      from jsonb_each_text(v_item_pool);

    if v_wtotal > 0 then
      for i in 1..v_item_count loop
        -- Selección ponderada de un ítem del pool
        v_r := random() * v_wtotal;
        v_acc := 0;
        v_code := null;
        for v_it in
          select key as code, value::numeric as w
          from jsonb_each_text(v_item_pool)
          order by key
        loop
          v_acc := v_acc + v_it.w;
          if v_r <= v_acc then
            v_code := v_it.code;
            exit;
          end if;
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
            'kind', 'item',
            'code', v_it.code,
            'name', v_it.name,
            'description', v_it.description,
            'item_kind', v_it.kind,
            'power', v_it.power,
            'rarity', v_it.rarity
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

select code, name, price_coins,
       (drop_table->>'size')::int as total,
       (drop_table->'items'->>'count')::int as items
from public.packs order by sort;
