-- ============================================================
-- ARREGLO DE LOS SOBRES (reemplaza a 0048)
--
-- La 0048 reescribió open_pack de cero y rompió dos cosas:
--   * insertaba en pack_openings.idem_key, columna que NO existe
--     (la idempotencia va dentro de results->>'idem');
--   * devolvía un arreglo suelto en vez de {'cards': ..., 'seed': ...},
--     que es lo que espera la aplicación.
--
-- Acá se parte de la función original que funcionaba y se le cambia
-- ÚNICAMENTE el conteo de jugadores:
--   Bronce y Plata: 7 objetos, de 5 a 7 jugadores.
--   Oro y Especial: 5 jugadores fijos + 2 extras.
-- Además el escudo deja de robarle un lugar a los jugadores.
-- ============================================================

create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_items jsonb; v_item_count int; v_item_pool jsonb; v_crest_chance numeric;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text;
  v_tpl record; v_new uuid; v_total int; v_off int;
  v_players int; v_code text; v_it record; v_pmin int; v_pmax int; v_extras int;
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
  -- Jugadores del sobre: entre players.min y players.max. Si el sobre
  -- no lo define, se mantiene el cálculo viejo (size menos los ítems).
  v_pmin := coalesce((v_pack.drop_table->'players'->>'min')::int,
                     greatest(1, v_size - v_item_count));
  v_pmax := coalesce((v_pack.drop_table->'players'->>'max')::int, v_pmin);
  if v_pmax < v_pmin then v_pmax := v_pmin; end if;
  v_players := v_pmin + floor(random() * (v_pmax - v_pmin + 1))::int;
  v_players := greatest(1, least(v_players, v_size));
  -- Lo que sobra son los lugares para escudo e ítems
  v_extras := greatest(0, v_size - v_players);
  v_item_count := v_extras;
  v_price := coalesce(v_pack.price_coins, 0);

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'pack_buy', p_pack_id::text, v_coins - v_price);

  -- ---------- Escudo (ocupa un lugar extra, nunca uno de jugador) ----------
  if v_extras > 0 and v_crest_chance > 0 and random() < v_crest_chance then
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
      v_extras := greatest(0, v_extras - 1);
      v_item_count := v_extras;
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
-- Composición de cada sobre
-- ------------------------------------------------------------
update public.packs set drop_table = jsonb_set(
  jsonb_set(drop_table, '{size}', '7'::jsonb),
  '{players}', '{"min":5,"max":7}'::jsonb
) where code in ('bronze', 'silver');

update public.packs set drop_table = jsonb_set(
  jsonb_set(drop_table, '{size}', '7'::jsonb),
  '{players}', '{"min":5,"max":5}'::jsonb
) where code in ('gold', 'special');

update public.packs set description =
  '7 objetos: 5 a 7 jugadores, el resto ítems o un escudo.'
  where code in ('bronze', 'silver');
update public.packs set description =
  '5 jugadores de nivel alto + 2 objetos (ítems o escudo).'
  where code in ('gold', 'special');

select code, drop_table->'players' as jugadores, drop_table->>'size' as objetos
from public.packs order by sort;
