-- ============================================================
-- MODO DRAFT (estilo Fut Draft)
--
-- Pagás una entrada, armás un once eligiendo entre 5 candidatos por
-- puesto (jugadores buenos, mejores que tu plantilla habitual) y jugás
-- hasta 5 partidos. Cada victoria mejora la recompensa; una derrota
-- termina la racha. Con 2 victorias recuperás la entrada.
--
-- Todo server-side: los candidatos, el resultado y las recompensas
-- se deciden y guardan en la base. El cliente solo elige.
-- ============================================================

-- ------------------------------------------------------------
-- SEGURIDAD (arreglo urgente)
-- import_players_from_staging borra TODO el catálogo y las cartas de
-- todos los usuarios. Estaba accesible a cualquier autenticado.
-- ------------------------------------------------------------
revoke execute on function public.import_players_from_staging() from authenticated;
revoke execute on function public.import_players_from_staging() from anon;
-- Queda accesible solo desde el SQL Editor (rol postgres/service_role).

-- Lo mismo con la función de desarrollo que regalaba cartas.
drop function if exists public.dev_grant_starter_cards();

-- ------------------------------------------------------------
-- 1) Configuración de premios
-- ------------------------------------------------------------
create table if not exists public.draft_config (
  id           int primary key default 1,
  entry_coins  bigint not null default 2500,
  rewards      jsonb not null,     -- {"0": {...}, "1": {...}, ...}
  active       boolean not null default true,
  check (id = 1)
);
alter table public.draft_config enable row level security;
drop policy if exists "draft_config_read" on public.draft_config;
create policy "draft_config_read" on public.draft_config for select using (true);

insert into public.draft_config (id, entry_coins, rewards) values (1, 2500, '{
  "0": {"coins": 300,   "packs": []},
  "1": {"coins": 1200,  "packs": []},
  "2": {"coins": 2600,  "packs": ["bronze"]},
  "3": {"coins": 5000,  "packs": ["silver"]},
  "4": {"coins": 9000,  "packs": ["gold"]},
  "5": {"coins": 18000, "packs": ["gold", "special"]}
}'::jsonb)
on conflict (id) do update
  set entry_coins = excluded.entry_coins, rewards = excluded.rewards;

-- ------------------------------------------------------------
-- 2) Partidas de draft
-- ------------------------------------------------------------
create table if not exists public.draft_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'drafting',  -- drafting | playing | finished
  formation    text not null default '4-3-3',
  slot_index   int  not null default 0,           -- puesto que toca elegir
  picks        jsonb not null default '[]',       -- jugadores elegidos
  candidates   jsonb,                             -- opciones del puesto actual
  wins         int  not null default 0,
  losses       int  not null default 0,
  entry_paid   bigint not null default 0,
  reward_coins bigint,
  reward_packs jsonb,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists idx_draft_user
  on public.draft_runs (user_id, status, created_at desc);
alter table public.draft_runs enable row level security;
drop policy if exists "draft_runs_own" on public.draft_runs;
create policy "draft_runs_own" on public.draft_runs
  for select using (auth.uid() = user_id);
-- Escritura solo por RPC.

-- ------------------------------------------------------------
-- 3) Puestos de la formación, en orden de elección
-- ------------------------------------------------------------
create or replace function public._draft_slots(p_formation text)
returns TABLE("pos" text, "code" text)
language sql immutable as $$
  select * from (values
    ('GK','GK'), ('CB','LCB'), ('CB','RCB'), ('LB','LB'), ('RB','RB'),
    ('CM','LCM'), ('CM','CM'), ('CM','RCM'),
    ('LW','LW'), ('ST','ST'), ('RW','RW')
  ) as t(pos, code);
$$;
-- Interna: solo la usan draft_start y draft_pick (SECURITY DEFINER).
revoke all on function public._draft_slots(text) from public;

-- ------------------------------------------------------------
-- 4) Sortear candidatos para un puesto
--    Nivel alto: en el draft tocan buenos jugadores.
-- ------------------------------------------------------------
create or replace function public._draft_candidates(p_position text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := '[]'::jsonb; r record; v_min int;
begin
  -- Los porteros del catálogo tienen medias algo más bajas
  v_min := case when p_position = 'GK' then 78 else 79 end;

  for r in
    select t.id as template_id, t.overall, t.position, t.attributes,
           t.gk_attributes, t.rarity,
           i.name, i.club_name, i.league_name, i.nationality
    from public.player_templates t
    join public.player_identities i on i.id = t.identity_id
    where t.position = p_position
      and t.overall >= v_min
    order by random()
    limit 5
  loop
    v_out := v_out || jsonb_build_object(
      'template_id', r.template_id,
      'name', r.name,
      'position', r.position,
      'overall', r.overall,
      'rarity', r.rarity,
      'attributes', r.attributes,
      'gk_attributes', r.gk_attributes,
      'club_name', r.club_name,
      'league_name', r.league_name,
      'nationality', r.nationality
    );
  end loop;

  -- Respaldo: si esa posición no tiene suficientes de nivel alto,
  -- se baja el listón progresivamente.
  if jsonb_array_length(v_out) < 5 then
    v_out := '[]'::jsonb;
    for r in
      select t.id as template_id, t.overall, t.position, t.attributes,
             t.gk_attributes, t.rarity,
             i.name, i.club_name, i.league_name, i.nationality
      from public.player_templates t
      join public.player_identities i on i.id = t.identity_id
      where t.position = p_position
      order by t.overall desc
      limit 40
    loop
      v_out := v_out || jsonb_build_object(
        'template_id', r.template_id,
        'name', r.name,
        'position', r.position,
        'overall', r.overall,
        'rarity', r.rarity,
        'attributes', r.attributes,
        'gk_attributes', r.gk_attributes,
        'club_name', r.club_name,
        'league_name', r.league_name,
        'nationality', r.nationality
      );
      exit when jsonb_array_length(v_out) >= 5;
    end loop;
  end if;

  return v_out;
end; $$;

-- ------------------------------------------------------------
-- 5) Empezar un draft (cobra la entrada)
-- ------------------------------------------------------------
create or replace function public.draft_start(p_formation text default '4-3-3')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_cfg record; v_coins bigint;
  v_id uuid; v_pos text; v_cands jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_cfg from public.draft_config where id = 1 and active;
  if not found then raise exception 'el modo draft no está disponible'; end if;

  -- Solo un draft activo a la vez
  if exists (select 1 from public.draft_runs
             where user_id = v_user and status in ('drafting', 'playing')) then
    raise exception 'ya tenés un draft en curso';
  end if;

  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_cfg.entry_coins then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_cfg.entry_coins where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_cfg.entry_coins, 'draft_entry', 'draft',
            v_coins - v_cfg.entry_coins);

  insert into public.draft_runs (user_id, formation, entry_paid)
    values (v_user, p_formation, v_cfg.entry_coins)
    returning id into v_id;

  -- Primer puesto a elegir
  select pos into v_pos from public._draft_slots(p_formation) with ordinality
    as x(pos, code, idx) where idx = 1;
  v_cands := public._draft_candidates(v_pos);
  update public.draft_runs set candidates = v_cands where id = v_id;

  return jsonb_build_object('run_id', v_id, 'position', v_pos, 'candidates', v_cands);
end; $$;
revoke all on function public.draft_start(text) from public;
grant execute on function public.draft_start(text) to authenticated;

-- ------------------------------------------------------------
-- 6) Elegir un candidato y pasar al siguiente puesto
-- ------------------------------------------------------------
create or replace function public.draft_pick(p_run_id uuid, p_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); r record; v_pick jsonb; v_next int;
  v_pos text; v_code text; v_cands jsonb; v_total int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into r from public.draft_runs
    where id = p_run_id and user_id = v_user for update;
  if not found then raise exception 'draft no encontrado'; end if;
  if r.status <> 'drafting' then raise exception 'ese draft ya está armado'; end if;

  if p_index < 0 or p_index >= jsonb_array_length(r.candidates) then
    raise exception 'opción inválida';
  end if;

  select count(*) into v_total from public._draft_slots(r.formation);

  -- Guardar la elección con el puesto que ocupa
  select s.pos, s.code into v_pos, v_code
    from public._draft_slots(r.formation) with ordinality as s(pos, code, idx)
    where idx = r.slot_index + 1;

  v_pick := (r.candidates -> p_index) || jsonb_build_object('slot', v_code, 'slot_pos', v_pos);
  v_next := r.slot_index + 1;

  if v_next >= v_total then
    -- Once completo
    update public.draft_runs
      set picks = r.picks || v_pick,
          slot_index = v_next,
          candidates = null,
          status = 'playing'
      where id = p_run_id;
    return jsonb_build_object('done', true, 'picks', r.picks || v_pick);
  end if;

  -- Siguiente puesto
  select s.pos into v_pos
    from public._draft_slots(r.formation) with ordinality as s(pos, code, idx)
    where idx = v_next + 1;
  v_cands := public._draft_candidates(v_pos);

  update public.draft_runs
    set picks = r.picks || v_pick,
        slot_index = v_next,
        candidates = v_cands
    where id = p_run_id;

  return jsonb_build_object(
    'done', false, 'position', v_pos,
    'candidates', v_cands, 'slot_index', v_next, 'total', v_total
  );
end; $$;
revoke all on function public.draft_pick(uuid, int) from public;
grant execute on function public.draft_pick(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- 7) Sobres ganados en el draft (se abren gratis)
-- ------------------------------------------------------------
create table if not exists public.draft_pack_credits (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  pack_code text not null references public.packs(code),
  run_id    uuid references public.draft_runs(id) on delete set null,
  used      boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_draft_credits
  on public.draft_pack_credits (user_id, used);
alter table public.draft_pack_credits enable row level security;
drop policy if exists "draft_credits_own" on public.draft_pack_credits;
create policy "draft_credits_own" on public.draft_pack_credits
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 8) Registrar el resultado de un partido del draft
-- ------------------------------------------------------------
create or replace function public.draft_record(p_run_id uuid, p_won boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); r record; v_wins int; v_losses int;
  v_cfg record; v_rw jsonb; v_coins bigint; v_prize bigint;
  v_pack text; v_pid uuid;
  v_finished boolean := false;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into r from public.draft_runs
    where id = p_run_id and user_id = v_user for update;
  if not found then raise exception 'draft no encontrado'; end if;
  if r.status <> 'playing' then raise exception 'ese draft no está en juego'; end if;

  v_wins := r.wins + case when p_won then 1 else 0 end;
  v_losses := r.losses + case when p_won then 0 else 1 end;

  -- Termina al perder o al ganar los 5
  v_finished := (not p_won) or v_wins >= 5;

  if not v_finished then
    update public.draft_runs set wins = v_wins where id = p_run_id;
    return jsonb_build_object('wins', v_wins, 'finished', false);
  end if;

  -- Pagar la recompensa (una sola vez: el estado ya pasó a 'finished')
  select * into v_cfg from public.draft_config where id = 1;
  v_rw := v_cfg.rewards -> v_wins::text;
  v_prize := coalesce((v_rw->>'coins')::bigint, 0);

  update public.draft_runs
    set wins = v_wins, losses = v_losses, status = 'finished',
        reward_coins = v_prize, reward_packs = coalesce(v_rw->'packs','[]'::jsonb),
        finished_at = now()
    where id = p_run_id;

  if v_prize > 0 then
    select coins into v_coins from public.profiles where id = v_user for update;
    update public.profiles set coins = coins + v_prize where id = v_user;
    insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
      values (v_user, v_prize, 'draft_reward', p_run_id::text, v_coins + v_prize);
  end if;

  -- Los sobres se entregan como créditos canjeables
  for v_pack in select jsonb_array_elements_text(coalesce(v_rw->'packs','[]'::jsonb))
  loop
    select id into v_pid from public.packs where code = v_pack;
    if v_pid is not null then
      insert into public.draft_pack_credits(user_id, pack_code, run_id)
        values (v_user, v_pack, p_run_id);
    end if;
  end loop;

  return jsonb_build_object(
    'wins', v_wins, 'finished', true,
    'coins', coalesce((v_rw->>'coins')::bigint, 0),
    'packs', coalesce(v_rw->'packs', '[]'::jsonb)
  );
end; $$;
revoke all on function public.draft_record(uuid, boolean) from public;
grant execute on function public.draft_record(uuid, boolean) to authenticated;

-- Canjear un sobre ganado (sin pagar monedas)
create or replace function public.redeem_draft_pack(p_credit_id bigint, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); c record; v_pack_id uuid;
  v_result jsonb; v_price bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into c from public.draft_pack_credits
    where id = p_credit_id and user_id = v_user for update;
  if not found then raise exception 'crédito no encontrado'; end if;
  if c.used then raise exception 'ese sobre ya fue canjeado'; end if;

  select id, price_coins into v_pack_id, v_price
    from public.packs where code = c.pack_code;
  if v_pack_id is null then raise exception 'sobre no disponible'; end if;

  -- Marcar usado ANTES de abrir (evita canje doble)
  update public.draft_pack_credits set used = true where id = p_credit_id;

  -- Acreditar el precio para que open_pack lo cobre: el sobre sale gratis
  update public.profiles set coins = coins + v_price where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    select v_user, v_price, 'draft_pack_credit', p_credit_id::text, coins
      from public.profiles where id = v_user;

  v_result := public.open_pack(v_pack_id, p_idem);
  return v_result;
end; $$;
revoke all on function public.redeem_draft_pack(bigint, text) from public;
grant execute on function public.redeem_draft_pack(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 9) Estado del draft en curso
-- ------------------------------------------------------------
create or replace function public.my_draft()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r record; v_total int; v_pos text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into r from public.draft_runs
    where user_id = v_user and status in ('drafting', 'playing')
    order by created_at desc limit 1;
  if not found then return null; end if;

  select count(*) into v_total from public._draft_slots(r.formation);
  select s.pos into v_pos
    from public._draft_slots(r.formation) with ordinality as s(pos, code, idx)
    where idx = r.slot_index + 1;

  return jsonb_build_object(
    'run_id', r.id, 'status', r.status, 'formation', r.formation,
    'slot_index', r.slot_index, 'total', v_total, 'position', v_pos,
    'picks', r.picks, 'candidates', r.candidates,
    'wins', r.wins, 'losses', r.losses
  );
end; $$;
grant execute on function public.my_draft() to authenticated;

-- Abandonar un draft (sin devolución)
create or replace function public.draft_abandon(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.draft_runs
    set status = 'finished', finished_at = now()
    where id = p_run_id and user_id = v_user and status in ('drafting','playing');
end; $$;
revoke all on function public.draft_abandon(uuid) from public;
grant execute on function public.draft_abandon(uuid) to authenticated;

-- Sobres pendientes de canjear
create or replace function public.my_draft_credits()
returns TABLE("id" bigint, "pack_code" text, "pack_name" text)
language sql stable security definer set search_path = public as $$
  select c.id, c.pack_code, p.name
  from public.draft_pack_credits c
  join public.packs p on p.code = c.pack_code
  where c.user_id = auth.uid() and not c.used
  order by c.created_at;
$$;
grant execute on function public.my_draft_credits() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select entry_coins from public.draft_config where id = 1) as entrada,
  (select count(*) from public.player_templates where overall >= 79) as jugadores_draft,
  (select has_function_privilege('authenticated',
     'public.import_players_from_staging()', 'execute')) as import_expuesto;
