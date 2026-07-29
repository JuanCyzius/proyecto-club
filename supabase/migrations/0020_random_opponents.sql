-- ============================================================
-- PLANTEL DE BIENVENIDA (17) + RIVALES ALEATORIOS POR FRANJA
--
-- 1. El sobre de bienvenida pasa de 27 a 17 jugadores.
-- 2. Ya no se elige el club rival: se elige una FRANJA de dificultad
--    y el servidor sortea un club real dentro de ese rango, con su
--    plantilla, táctica y escudo. Cada partido, un rival distinto.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Plantel de bienvenida: 17 jugadores
--    (2 arqueros, 6 defensores, 6 medios, 3 delanteros)
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
-- 2) Franjas de dificultad
-- ------------------------------------------------------------
create table if not exists public.difficulty_tiers (
  code       text primary key,
  name       text not null,
  subtitle   text not null,
  min_rating int not null,
  max_rating int not null,
  sort       int not null,
  reward_mult numeric not null default 1
);
alter table public.difficulty_tiers enable row level security;
drop policy if exists "tiers_read" on public.difficulty_tiers;
create policy "tiers_read" on public.difficulty_tiers for select using (true);

delete from public.difficulty_tiers;
insert into public.difficulty_tiers
  (code, name, subtitle, min_rating, max_rating, sort, reward_mult) values
  -- Rangos ajustados a los clubes que existen de verdad en el catálogo:
  -- el club real más flojo ronda 62 y el más fuerte 88.
  ('t65',  'Nivel 65', 'Clubes modestos. Ideal para empezar.',        0,  66, 10, 1.0),
  ('t70',  'Nivel 70', 'Equipos de mitad de tabla.',                 67,  71, 20, 1.3),
  ('t75',  'Nivel 75', 'Clubes competitivos.',                       72,  76, 30, 1.7),
  ('t80',  'Nivel 80', 'Equipos fuertes de liga grande.',            77,  81, 40, 2.2),
  ('t85',  'Nivel 85', 'Élite europea.',                             82,  86, 50, 2.9),
  ('t90',  'Nivel 90', 'Los mejores clubes del mundo.',              87,  91, 60, 3.8),
  ('t95',  'Nivel 95', 'Selección Mundial. Casi imposible.',         92,  96, 70, 5.0),
  ('t99',  'Nivel 99', 'Los Inmortales. El desafío definitivo.',     97,  99, 80, 7.0)
on conflict (code) do update
  set name = excluded.name, subtitle = excluded.subtitle,
      min_rating = excluded.min_rating, max_rating = excluded.max_rating,
      sort = excluded.sort, reward_mult = excluded.reward_mult;

-- ------------------------------------------------------------
-- 3) Todos los clubes reales vuelven a estar disponibles como rivales
--    (el sorteo necesita variedad; ya no se muestran en una lista)
-- ------------------------------------------------------------
update public.ai_opponents
  set active = true
  where real_club is not null;

-- Los inventados también
update public.ai_opponents
  set active = true
  where real_club is null and rating >= 92;

-- ------------------------------------------------------------
-- 4) RPC: sortear un rival dentro de la franja
-- ------------------------------------------------------------
create or replace function public.random_opponent(p_tier text)
returns TABLE(
  "id" uuid,
  "name" text,
  "style" text,
  "tier" text,
  "rating" int,
  "formation" text,
  "real_club" text,
  "logo_path" text
)
language plpgsql stable security definer set search_path = public as $$
declare v_t record;
begin
  select * into v_t from public.difficulty_tiers where code = p_tier;
  if not found then raise exception 'franja de dificultad inválida'; end if;

  return query
  select ao.id, ao.name, ao.style, ao.tier, ao.rating,
         ao.formation, ao.real_club, ao.logo_path
  from public.ai_opponents ao
  where ao.active
    and ao.rating between v_t.min_rating and v_t.max_rating
  order by random()
  limit 1;

  -- Si esa franja quedó vacía, se toma el rival más cercano
  if not found then
    return query
    select ao.id, ao.name, ao.style, ao.tier, ao.rating,
           ao.formation, ao.real_club, ao.logo_path
    from public.ai_opponents ao
    where ao.active
    order by abs(ao.rating - ((v_t.min_rating + v_t.max_rating) / 2))
    limit 1;
  end if;
end; $$;
grant execute on function public.random_opponent(text) to authenticated;

-- ------------------------------------------------------------
-- 5) Recompensa por franja: cuanto más difícil, más paga
-- ------------------------------------------------------------
create or replace function public.grant_match_reward(p_match_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_m record; v_rating int; v_win numeric; v_base numeric;
  v_mult numeric; v_today int; v_reward bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select m.home_user, m.winner, m.ai_opponent, ao.rating as ai_rating
    into v_m
    from public.matches m
    left join public.ai_opponents ao on ao.id = m.ai_opponent
    where m.id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if v_m.home_user <> v_user then raise exception 'not your match'; end if;

  if exists (
    select 1 from public.coin_ledger
    where user_id = v_user and reason = 'match_reward' and ref = p_match_id::text
  ) then
    return 0;
  end if;

  v_rating := coalesce(v_m.ai_rating, 65);
  v_win := 100 * (1 + (v_rating - 60) * 0.05);
  v_win := greatest(v_win, 60);

  v_base := case
    when v_m.winner = 'home' then v_win
    when v_m.winner = 'draw' then v_win * 0.40
    else v_win * 0.15
  end;

  select count(*) into v_today from public.coin_ledger
    where user_id = v_user and reason = 'match_reward'
      and created_at >= date_trunc('day', now());
  v_mult := greatest(0.25, 1 - v_today * 0.08);

  v_reward := greatest(1, floor(v_base * v_mult))::bigint;

  select coins into v_coins from public.profiles where id = v_user for update;
  update public.profiles set coins = coins + v_reward where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, v_reward, 'match_reward', p_match_id::text, v_coins + v_reward);
  update public.matches set reward_coins = v_reward where id = p_match_id;

  return v_reward;
end; $$;
revoke all on function public.grant_match_reward(uuid) from public;
grant execute on function public.grant_match_reward(uuid) to authenticated;

-- ------------------------------------------------------------
-- Comprobación: cuántos rivales hay en cada franja
-- ------------------------------------------------------------
select t.code, t.name, t.min_rating, t.max_rating,
       count(ao.id) as rivales_disponibles
from public.difficulty_tiers t
left join public.ai_opponents ao
  on ao.active and ao.rating between t.min_rating and t.max_rating
group by t.code, t.name, t.min_rating, t.max_rating, t.sort
order by t.sort;
