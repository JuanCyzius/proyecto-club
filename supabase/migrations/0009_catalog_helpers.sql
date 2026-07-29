-- ============================================================
-- Helpers del catálogo: listas para los filtros y sobres/IA
-- ============================================================

-- Ligas disponibles (ordenadas por cantidad de jugadores)
create or replace function public.list_leagues()
returns TABLE(league_name text, total bigint)
language sql stable security definer set search_path = public as $$
  select i.league_name, count(*)::bigint
  from public.player_identities i
  where i.league_name is not null
  group by i.league_name
  order by count(*) desc;
$$;
grant execute on function public.list_leagues() to anon, authenticated;

-- Nacionalidades disponibles
create or replace function public.list_nationalities()
returns TABLE(nationality text, total bigint)
language sql stable security definer set search_path = public as $$
  select i.nationality, count(*)::bigint
  from public.player_identities i
  where i.nationality is not null
  group by i.nationality
  order by count(*) desc;
$$;
grant execute on function public.list_nationalities() to anon, authenticated;

-- ------------------------------------------------------------
-- open_pack v2: devuelve también posiciones y stats de portero
-- (la lógica económica es idéntica: cobro atómico + ledger)
-- ------------------------------------------------------------
create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text; v_tpl record; v_new uuid;
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
  v_price := coalesce(v_pack.price_coins, 0);

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_price then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_price, 'pack_buy', p_pack_id::text, v_coins - v_price);

  for i in 0..(v_size - 1) loop
    v_wslot := v_weights;
    if i < jsonb_array_length(v_guaranteed) then
      v_minr := v_guaranteed->i->>'minRarity';
      if v_minr is not null then
        v_wslot := public._filter_weights(v_weights, v_minr);
      end if;
    end if;
    v_rarity := public._pick_rarity(v_wslot);

    select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
           pt.attributes, pt.gk_attributes
      into v_tpl
      from public.player_templates pt
      where pt.rarity = v_rarity
      order by random() limit 1;

    if v_tpl.id is null then
      select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
             pt.attributes, pt.gk_attributes
        into v_tpl
        from public.player_templates pt
        order by random() limit 1;
    end if;

    insert into public.player_cards(template_id, owner_id)
      values (v_tpl.id, v_user) returning id into v_new;

    v_results := v_results || jsonb_build_object(
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

  insert into public.pack_openings(user_id, pack_id, seed, results)
    values (v_user, p_pack_id, v_seed,
      jsonb_build_object('idem', p_idem, 'seed', v_seed, 'cards', v_results));

  return jsonb_build_object('cards', v_results, 'seed', v_seed);
end; $$;
revoke all on function public.open_pack(uuid, text) from public;
grant execute on function public.open_pack(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- claim_welcome v2: reparte desde la base real, con topes de media
-- para que el plantel inicial sea modesto (no regala cracks).
-- ------------------------------------------------------------
create or replace function public.claim_welcome()
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_templates int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if;

  select count(*) into v_templates from public.player_templates;
  if v_templates = 0 then
    raise exception 'catalog empty: importá primero el CSV (ver supabase/import/README.md)';
  end if;

  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from public.player_templates t
       where t.position = 'GK' and t.overall between 60 and 74
       order by random() limit 3)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CB','RB','LB','RWB','LWB') and t.overall between 60 and 74
       order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CDM','CM','CAM','RM','LM') and t.overall between 60 and 74
       order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('RW','LW','CF','ST') and t.overall between 60 and 74
       order by random() limit 6)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;

  -- Red de seguridad si algún filtro no encontró suficientes
  if v_count < 18 then
    insert into public.player_cards (template_id, owner_id)
    select t.id, v_user from public.player_templates t
    order by random() limit (18 - v_count);
    select count(*) into v_count from public.player_cards where owner_id = v_user;
  end if;

  return v_count;
end; $$;
revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;
