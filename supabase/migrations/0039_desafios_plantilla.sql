-- ============================================================
-- DESAFÍOS DE PLANTILLA (estilo EA FC SBC)
--
-- Entregás jugadores de tu colección cumpliendo restricciones
-- (media, química, rarezas, nación/liga/club) y cobrás el premio.
-- LAS CARTAS ENTREGADAS SE PIERDEN.
--
-- Tipos: fixed (siempre visibles, una vez), daily (3 por día),
-- hard (1 cada 3 días, repetibles). Los "repeatable" se pueden
-- completar todas las veces que quieras (las cartas los limitan).
-- Sobres de premio: van a draft_pack_credits (se abren gratis en
-- la Tienda, misma mecánica que los del Draft).
-- ============================================================

create table if not exists public.sbc_challenges (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  title        text not null,
  description  text,
  kind         text not null check (kind in ('fixed','daily','hard')),
  repeatable   boolean not null default false,
  requirements jsonb not null,   -- {"size":11,"min_avg":78,"min_chem":60,"rarity_min":{"rarity":"rare","count":2},"max_rarity":"common","nation":{"name":"Argentina","count":4},"league":{...},"club":{...}}
  reward_coins bigint not null default 0,
  reward_packs jsonb not null default '[]',   -- ["bronze","gold"]
  active       boolean not null default true,
  sort         int not null default 100
);
alter table public.sbc_challenges enable row level security;
drop policy if exists "sbc_read" on public.sbc_challenges;
create policy "sbc_read" on public.sbc_challenges for select using (true);

create table if not exists public.sbc_rotation (
  kind         text not null,
  period       text not null,
  challenge_id bigint not null references public.sbc_challenges(id) on delete cascade,
  primary key (kind, period, challenge_id)
);
alter table public.sbc_rotation enable row level security;
drop policy if exists "sbc_rot_read" on public.sbc_rotation;
create policy "sbc_rot_read" on public.sbc_rotation for select using (true);

create table if not exists public.sbc_completions (
  id           bigint generated always as identity primary key,
  challenge_id bigint not null references public.sbc_challenges(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  period       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_sbc_done on public.sbc_completions (user_id, challenge_id, period);
alter table public.sbc_completions enable row level security;
drop policy if exists "sbc_done_own" on public.sbc_completions;
create policy "sbc_done_own" on public.sbc_completions for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Desafíos activos ahora: fijos + 3 del día + 1 difícil (3 días)
-- ------------------------------------------------------------
create or replace function public.sbc_active()
returns TABLE(
  "id" bigint, "code" text, "title" text, "description" text,
  "kind" text, "repeatable" boolean, "requirements" jsonb,
  "reward_coins" bigint, "reward_packs" jsonb, "period" text,
  "done_count" int
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_day text := current_date::text;
  v_h3 text := floor(extract(epoch from now()) / 259200)::bigint::text;
begin
  -- Sortear rotaciones que falten (con lock contra carreras)
  if not exists (select 1 from public.sbc_rotation r where r.kind='daily' and r.period=v_day) then
    perform pg_advisory_xact_lock(662201);
    if not exists (select 1 from public.sbc_rotation r where r.kind='daily' and r.period=v_day) then
      insert into public.sbc_rotation (kind, period, challenge_id)
        select 'daily', v_day, c.id from public.sbc_challenges c
        where c.kind='daily' and c.active order by random() limit 3;
    end if;
  end if;
  if not exists (select 1 from public.sbc_rotation r where r.kind='hard' and r.period=v_h3) then
    perform pg_advisory_xact_lock(662202);
    if not exists (select 1 from public.sbc_rotation r where r.kind='hard' and r.period=v_h3) then
      insert into public.sbc_rotation (kind, period, challenge_id)
        select 'hard', v_h3, c.id from public.sbc_challenges c
        where c.kind='hard' and c.active order by random() limit 1;
    end if;
  end if;

  return query
    select c.id, c.code, c.title, c.description, c.kind, c.repeatable,
           c.requirements, c.reward_coins, c.reward_packs,
           case c.kind when 'daily' then v_day when 'hard' then v_h3 else 'fixed' end,
           (select count(*)::int from public.sbc_completions x
             where x.challenge_id = c.id and x.user_id = auth.uid()
               and (c.kind = 'fixed' or x.period =
                    case c.kind when 'daily' then v_day else v_h3 end))
    from public.sbc_challenges c
    where c.active and (
      c.kind = 'fixed'
      or (c.kind='daily' and exists (select 1 from public.sbc_rotation r
            where r.kind='daily' and r.period=v_day and r.challenge_id=c.id))
      or (c.kind='hard' and exists (select 1 from public.sbc_rotation r
            where r.kind='hard' and r.period=v_h3 and r.challenge_id=c.id))
    )
    order by case c.kind when 'daily' then 0 when 'hard' then 1 else 2 end, c.sort;
end; $$;
grant execute on function public.sbc_active() to authenticated;

-- ------------------------------------------------------------
-- Entrega (SOLO service_role: la valida el servidor de la app,
-- que revisa media/química/restricciones antes de llamar acá).
-- Consume las cartas, paga y registra, todo en una transacción.
-- ------------------------------------------------------------
create or replace function public.sbc_consume(
  p_user uuid, p_challenge bigint, p_cards uuid[], p_period text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; v_coins bigint; v_pack text; v_n int;
begin
  select * into c from public.sbc_challenges where id = p_challenge and active;
  if not found then raise exception 'desafío no disponible'; end if;

  if array_length(p_cards, 1) is distinct from (c.requirements->>'size')::int then
    raise exception 'cantidad de jugadores incorrecta';
  end if;
  if (select count(distinct x) from unnest(p_cards) x) <> array_length(p_cards, 1) then
    raise exception 'hay jugadores repetidos';
  end if;

  -- Completado previo (los repetibles no tienen límite)
  if not c.repeatable then
    if exists (select 1 from public.sbc_completions
               where challenge_id = p_challenge and user_id = p_user
                 and (c.kind = 'fixed' or period = p_period)) then
      raise exception 'ya completaste este desafío';
    end if;
  end if;

  -- Las cartas deben ser tuyas, estar libres y fuera del once/banca
  select count(*) into v_n from public.player_cards pc
    where pc.id = any(p_cards) and pc.owner_id = p_user and pc.status = 'in_club'
      and not exists (select 1 from public.squad_slots s where s.card_id = pc.id);
  if v_n <> array_length(p_cards, 1) then
    raise exception 'alguna carta no está disponible (¿está en tu once o en el mercado?)';
  end if;

  -- Consumir: se pierden para siempre
  delete from public.player_cards where id = any(p_cards) and owner_id = p_user;

  if c.reward_coins > 0 then
    select coins into v_coins from public.profiles where id = p_user for update;
    update public.profiles set coins = coins + c.reward_coins where id = p_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (p_user, c.reward_coins, 'sbc_reward', c.code, v_coins + c.reward_coins);
  end if;

  for v_pack in select jsonb_array_elements_text(c.reward_packs) loop
    if exists (select 1 from public.packs where code = v_pack) then
      insert into public.draft_pack_credits (user_id, pack_code)
        values (p_user, v_pack);
    end if;
  end loop;

  insert into public.sbc_completions (challenge_id, user_id, period)
    values (p_challenge, p_user, p_period);

  return jsonb_build_object('coins', c.reward_coins, 'packs', c.reward_packs);
end; $$;
revoke all on function public.sbc_consume(uuid, bigint, uuid[], text) from public;
revoke all on function public.sbc_consume(uuid, bigint, uuid[], text) from authenticated;
-- Solo la clave secreta del servidor puede ejecutarla.

-- ------------------------------------------------------------
-- Set inicial de desafíos
-- ------------------------------------------------------------
insert into public.sbc_challenges
  (code, title, description, kind, repeatable, requirements, reward_coins, reward_packs, sort)
values
  -- Fijos
  ('bienvenida', 'Primeros pasos', 'Entregá 3 jugadores cualquiera de tu colección.',
   'fixed', false, '{"size":3}', 500, '[]', 10),
  ('fundicion', 'Fundición de comunes', 'Entregá 5 jugadores comunes. Repetible: ideal para limpiar repetidos.',
   'fixed', true, '{"size":5,"max_rarity":"common"}', 700, '[]', 20),
  ('media-plata', 'Media de plata', '8 jugadores con media 72 o más y química 50+.',
   'fixed', false, '{"size":8,"min_avg":72,"min_chem":50}', 2000, '["bronze"]', 30),
  ('albiceleste', 'Sangre albiceleste', '6 jugadores con al menos 4 argentinos y algo de química.',
   'fixed', false, '{"size":6,"nation":{"name":"Argentina","count":4},"min_chem":40}', 2500, '[]', 40),
  -- Pool diario (salen 3 por día, una vez por día cada uno)
  ('d-media68', 'Del día: base sólida', '6 jugadores con media 68+.',
   'daily', false, '{"size":6,"min_avg":68}', 1200, '[]', 10),
  ('d-quimica', 'Del día: buena conexión', '8 jugadores con química 60+.',
   'daily', false, '{"size":8,"min_chem":60}', 1500, '["bronze"]', 20),
  ('d-raros', 'Del día: par de raros', '5 jugadores, al menos 2 raros o mejores.',
   'daily', false, '{"size":5,"rarity_min":{"rarity":"rare","count":2}}', 2200, '[]', 30),
  ('d-media74', 'Del día: nivel serio', '7 jugadores con media 74+.',
   'daily', false, '{"size":7,"min_avg":74}', 2600, '["bronze"]', 40),
  ('d-brasil', 'Del día: jogo bonito', '6 jugadores con al menos 3 brasileños.',
   'daily', false, '{"size":6,"nation":{"name":"Brazil","count":3}}', 1800, '[]', 50),
  ('d-mix', 'Del día: equipo armado', '9 jugadores, media 70+ y química 45+.',
   'daily', false, '{"size":9,"min_avg":70,"min_chem":45}', 2400, '[]', 60),
  ('d-pococomun', 'Del día: poco comunes', '5 jugadores, al menos 4 poco comunes o mejores.',
   'daily', false, '{"size":5,"rarity_min":{"rarity":"uncommon","count":4}}', 1300, '[]', 70),
  ('d-epico', 'Del día: toque épico', '8 jugadores media 72+, con al menos 1 épico.',
   'daily', false, '{"size":8,"min_avg":72,"rarity_min":{"rarity":"epic","count":1}}', 3000, '["silver"]', 80),
  -- Pool difícil (1 cada 3 días, repetibles)
  ('h-elite', 'Élite', 'Once completo: media 82+, química 65+ y 2 legendarios o mejores. Repetible.',
   'hard', true, '{"size":11,"min_avg":82,"min_chem":65,"rarity_min":{"rarity":"legendary","count":2}}', 12000, '["gold","special"]', 10),
  ('h-muralla', 'La muralla', 'Once completo: media 80+ y química 70+. Repetible.',
   'hard', true, '{"size":11,"min_avg":80,"min_chem":70}', 8000, '["gold"]', 20),
  ('h-icono', 'Cazador de íconos', 'Once completo: media 83+ con al menos 1 ícono. Repetible.',
   'hard', true, '{"size":11,"min_avg":83,"rarity_min":{"rarity":"icon","count":1}}', 15000, '["special"]', 30)
on conflict (code) do nothing;

select count(*) as desafios_cargados from public.sbc_challenges;
