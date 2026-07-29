-- ============================================================
-- ARREGLO DE SOBRES + NUEVOS RIVALES
--
-- 1. open_pack fallaba con el catálogo real (19.239 jugadores):
--    `order by random()` recorría la tabla entera 5 veces por sobre.
--    Ahora se sortea con un desplazamiento aleatorio sobre un índice.
-- 2. Se reduce la lista de rivales a una selección curada por nivel,
--    más clubes de élite inventados (95 y 99).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Índice para sortear por rareza sin escanear la tabla
-- ------------------------------------------------------------
create index if not exists idx_templates_rarity_id
  on public.player_templates (rarity, id);

-- Conteo por rareza cacheado (evita count(*) en cada tirada)
create table if not exists public.rarity_counts (
  rarity text primary key,
  total  int not null
);
alter table public.rarity_counts enable row level security;
drop policy if exists "rarity_counts_read" on public.rarity_counts;
create policy "rarity_counts_read" on public.rarity_counts for select using (true);

create or replace function public.refresh_rarity_counts()
returns void language sql security definer set search_path = public as $$
  delete from public.rarity_counts;
  insert into public.rarity_counts (rarity, total)
  select rarity, count(*)::int from public.player_templates group by rarity;
$$;
select public.refresh_rarity_counts();

-- ------------------------------------------------------------
-- 2) open_pack optimizado
-- ------------------------------------------------------------
create or replace function public.open_pack(p_pack_id uuid, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_pack record; v_size int; v_weights jsonb; v_guaranteed jsonb;
  v_coins bigint; v_price bigint; v_seed text := encode(gen_random_bytes(8), 'hex');
  v_results jsonb := '[]'::jsonb;
  i int; v_minr text; v_wslot jsonb; v_rarity text;
  v_tpl record; v_new uuid; v_total int; v_off int;
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

    -- Sorteo eficiente: desplazamiento aleatorio sobre el índice
    select total into v_total from public.rarity_counts where rarity = v_rarity;
    if v_total is null or v_total = 0 then
      select total into v_total from public.rarity_counts where rarity = 'common';
      v_rarity := 'common';
    end if;

    v_off := floor(random() * greatest(v_total, 1))::int;

    select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
           pt.attributes, pt.gk_attributes
      into v_tpl
      from public.player_templates pt
      where pt.rarity = v_rarity
      order by pt.id
      offset v_off limit 1;

    -- Respaldo si el offset se pasó (conteo desactualizado)
    if v_tpl.id is null then
      select pt.id, pt.overall, pt.position, pt.rarity, pt.identity_id,
             pt.attributes, pt.gk_attributes
        into v_tpl
        from public.player_templates pt
        where pt.rarity = v_rarity
        order by pt.id limit 1;
    end if;
    if v_tpl.id is null then
      raise exception 'no hay jugadores en el catálogo (importá el CSV)';
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

-- claim_welcome también usaba order by random(): mismo arreglo
create or replace function public.claim_welcome()
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_templates int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if;

  select count(*) into v_templates from public.player_templates;
  if v_templates = 0 then
    raise exception 'catalog empty: importá primero el CSV';
  end if;

  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from public.player_templates t
       where t.position = 'GK' and t.overall between 62 and 72 limit 60)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CB','RB','LB','RWB','LWB') and t.overall between 62 and 72 limit 200)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CDM','CM','CAM','RM','LM') and t.overall between 62 and 72 limit 200)
    union all
    (select t.id from public.player_templates t
       where t.position in ('RW','LW','CF','ST') and t.overall between 62 and 72 limit 150)
  ) pool
  order by random()
  limit 27;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  return v_count;
end; $$;
revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;

-- ------------------------------------------------------------
-- 3) Rivales: selección curada por nivel + élite inventada
-- ------------------------------------------------------------
-- Se desactivan todos y se reactivan solo los elegidos (no se borran,
-- para no romper el historial de partidos).
update public.ai_opponents set active = false;

-- Los 6 clubes reales más representativos de cada franja de nivel
with ranked as (
  select ao.id, ao.rating,
         case
           when ao.rating >= 84 then 90
           when ao.rating >= 79 then 85
           when ao.rating >= 74 then 80
           when ao.rating >= 69 then 75
           when ao.rating >= 64 then 70
           else 65
         end as band,
         row_number() over (
           partition by case
             when ao.rating >= 84 then 90
             when ao.rating >= 79 then 85
             when ao.rating >= 74 then 80
             when ao.rating >= 69 then 75
             when ao.rating >= 64 then 70
             else 65
           end
           order by ao.rating desc
         ) as rn
  from public.ai_opponents ao
  where ao.real_club is not null
)
update public.ai_opponents ao
set active = true, sort = r.band * 10 + r.rn
from ranked r
where ao.id = r.id and r.rn <= 6;

-- Clubes de élite inventados (por encima de cualquier club real)
insert into public.ai_opponents
  (name, style, tier, rating, formation, sort, real_club, logo_path, active)
select * from (values
  ('Selección Mundial',  'possession', 'legendary', 95, '4-3-3', 950, null, null, true),
  ('Los Inmortales',     'high_press', 'legendary', 99, '4-3-3', 990, null, null, true)
) as v(name, style, tier, rating, formation, sort, real_club, logo_path, active)
where not exists (
  select 1 from public.ai_opponents where name = v.name
);

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.rarity_counts)                as rarezas,
  (select sum(total) from public.rarity_counts)              as jugadores_indexados,
  (select count(*) from public.ai_opponents where active)    as rivales_activos,
  (select max(rating) from public.ai_opponents where active) as rival_mas_dificil;
