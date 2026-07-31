-- ============================================================
-- DUELO DE CARTAS (PvP en vivo por rondas)
--
-- 10 rondas · cada una con una categoría de stats al azar · ambos
-- eligen una carta en secreto (15s) · se revelan y gana la suma
-- mayor · 1 punto por ronda · el que más puntos junta se lleva el
-- pozo (comisión 5%). Empate: desempata la suma total acumulada de
-- toda la partida (lógica encapsulada en _duel_cards_tiebreak);
-- si sigue igualado es empate y se devuelven las apuestas.
--
-- SEGURIDAD: TODO el estado vive en el servidor. La tabla no tiene
-- SELECT directo: los clientes solo ven lo que devuelve
-- duel_cards_state(), que jamás incluye las cartas del rival sin
-- revelar. Las elecciones, el reloj (deadline) y la resolución son
-- del servidor: no se puede ver la mano ajena ni manipular el
-- resultado ni duplicar monedas (escrow con ledger, igual que los
-- duelos de penales).
-- ============================================================

create table if not exists public.duel_cards_matches (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,                 -- sala privada (null = búsqueda)
  status     text not null default 'waiting',  -- waiting|active|done|cancelled
  p1         uuid not null references public.profiles(id) on delete cascade,
  p2         uuid references public.profiles(id) on delete cascade,
  stake      bigint not null default 0,
  categories jsonb,                       -- [["pace","shooting"], ...] x11 (10 + desempate)
  round      int not null default 0,      -- 1..10 durante la partida
  deadline   timestamptz,
  p1_cards   jsonb, p2_cards jsonb,       -- [{name,position,rarity,overall,attrs},...] x10
  p1_pick    int, p2_pick int,            -- índice elegido esta ronda (secreto)
  p1_used    jsonb not null default '[]', -- índices ya gastados
  p2_used    jsonb not null default '[]',
  p1_score   int not null default 0,
  p2_score   int not null default 0,
  p1_total   bigint not null default 0,   -- suma acumulada (para el desempate)
  p2_total   bigint not null default 0,
  rounds     jsonb not null default '[]', -- log revelado de cada ronda
  winner     uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_dcm_search on public.duel_cards_matches (status, stake) where code is null;
alter table public.duel_cards_matches enable row level security;
-- Sin políticas de SELECT a propósito: el acceso es solo vía RPC.

-- ------------------------------------------------------------
-- Utilidades internas
-- ------------------------------------------------------------
create or replace function public._duel_cards_categories()
returns jsonb language sql volatile as $$
  -- 11 categorías al azar sin repetir (10 rondas + posible desempate)
  select jsonb_agg(cat) from (
    select cat from (values
      ('["pace"]'::jsonb), ('["shooting"]'::jsonb), ('["passing"]'::jsonb),
      ('["dribbling"]'::jsonb), ('["defending"]'::jsonb), ('["physical"]'::jsonb),
      ('["pace","shooting"]'::jsonb), ('["pace","dribbling"]'::jsonb),
      ('["pace","passing"]'::jsonb), ('["shooting","physical"]'::jsonb),
      ('["shooting","dribbling"]'::jsonb), ('["passing","dribbling"]'::jsonb),
      ('["passing","defending"]'::jsonb), ('["defending","physical"]'::jsonb),
      ('["defending","pace"]'::jsonb), ('["physical","dribbling"]'::jsonb),
      ('["passing","physical"]'::jsonb), ('["shooting","passing"]'::jsonb)
    ) t(cat) order by random() limit 11
  ) x;
$$;

-- Los 10 jugadores de campo del once titular, con sus stats congeladas
create or replace function public._duel_cards_squad(p_user uuid)
returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object(
    'name', i.name, 'position', t.position, 'rarity', t.rarity,
    'overall', t.overall, 'attrs', t.attributes
  ) order by t.overall desc)
  from public.squad_slots s
  join public.player_cards pc on pc.id = s.card_id
  join public.player_templates t on t.id = pc.template_id
  join public.player_identities i on i.id = t.identity_id
  where s.user_id = p_user and s.slot not like 'SUB%'
    and s.card_id is not null and t.position <> 'GK';
$$;

-- Suma de la categoría para una carta
create or replace function public._duel_cards_sum(p_card jsonb, p_cat jsonb)
returns bigint language sql immutable as $$
  select coalesce(sum(coalesce((p_card->'attrs'->>k)::bigint, 0)), 0)
  from jsonb_array_elements_text(p_cat) k;
$$;

-- Desempate (encapsulado para poder cambiarlo fácil):
-- gana la mayor suma acumulada de toda la partida; igualdad = empate.
create or replace function public._duel_cards_tiebreak(p1_total bigint, p2_total bigint)
returns text language sql immutable as $$
  select case when p1_total > p2_total then 'p1'
              when p2_total > p1_total then 'p2'
              else 'draw' end;
$$;

-- Retener / devolver / pagar con ledger
create or replace function public._duel_cards_hold(p_user uuid, p_amount bigint, p_ref text)
returns void language plpgsql as $$
declare v_coins bigint;
begin
  if p_amount <= 0 then return; end if;
  select coins into v_coins from public.profiles where id = p_user for update;
  if v_coins < p_amount then raise exception 'insufficient funds'; end if;
  update public.profiles set coins = coins - p_amount where id = p_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (p_user, -p_amount, 'cardduel_hold', p_ref, v_coins - p_amount);
end; $$;

create or replace function public._duel_cards_pay(p_user uuid, p_amount bigint, p_reason text, p_ref text)
returns void language plpgsql as $$
declare v_coins bigint;
begin
  if p_amount <= 0 then return; end if;
  select coins into v_coins from public.profiles where id = p_user for update;
  update public.profiles set coins = coins + p_amount where id = p_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (p_user, p_amount, p_reason, p_ref, v_coins + p_amount);
end; $$;

-- Cierre de la partida: gana el de más puntos; empate → tiebreak
create or replace function public._duel_cards_finish(p_id uuid)
returns void language plpgsql as $$
declare m record; v_side text; v_pot bigint; v_fee bigint;
begin
  select * into m from public.duel_cards_matches where id = p_id;
  v_side := case
    when m.p1_score > m.p2_score then 'p1'
    when m.p2_score > m.p1_score then 'p2'
    else public._duel_cards_tiebreak(m.p1_total, m.p2_total)
  end;

  if v_side = 'draw' then
    perform public._duel_cards_pay(m.p1, m.stake, 'cardduel_refund', p_id::text);
    perform public._duel_cards_pay(m.p2, m.stake, 'cardduel_refund', p_id::text);
    update public.duel_cards_matches set status = 'done', winner = null where id = p_id;
  else
    v_pot := m.stake * 2;
    v_fee := case when v_pot > 0 then greatest(1, (v_pot * 0.05)::bigint) else 0 end;
    perform public._duel_cards_pay(
      case v_side when 'p1' then m.p1 else m.p2 end,
      v_pot - v_fee, 'cardduel_win', p_id::text);
    update public.duel_cards_matches
      set status = 'done',
          winner = case v_side when 'p1' then m.p1 else m.p2 end
      where id = p_id;
  end if;
end; $$;

-- Resolver la ronda actual si ambos eligieron
create or replace function public._duel_cards_resolve(p_id uuid)
returns void language plpgsql as $$
declare
  m record; cat jsonb; c1 jsonb; c2 jsonb; s1 bigint; s2 bigint; w text;
begin
  select * into m from public.duel_cards_matches where id = p_id;
  if m.p1_pick is null or m.p2_pick is null then return; end if;

  cat := m.categories -> (m.round - 1);
  c1 := m.p1_cards -> m.p1_pick;
  c2 := m.p2_cards -> m.p2_pick;
  s1 := public._duel_cards_sum(c1, cat);
  s2 := public._duel_cards_sum(c2, cat);
  w := case when s1 > s2 then 'p1' when s2 > s1 then 'p2' else 'tie' end;

  update public.duel_cards_matches set
    rounds = rounds || jsonb_build_object(
      'round', m.round, 'category', cat,
      'p1', jsonb_build_object('card', c1, 'total', s1),
      'p2', jsonb_build_object('card', c2, 'total', s2),
      'winner', w),
    p1_score = p1_score + case when w = 'p1' then 1 else 0 end,
    p2_score = p2_score + case when w = 'p2' then 1 else 0 end,
    p1_total = p1_total + s1,
    p2_total = p2_total + s2,
    p1_used = p1_used || to_jsonb(m.p1_pick),
    p2_used = p2_used || to_jsonb(m.p2_pick),
    p1_pick = null, p2_pick = null,
    round = case when m.round >= 10 then m.round else m.round + 1 end,
    deadline = case when m.round >= 10 then null else now() + interval '18 seconds' end
    where id = p_id;

  if m.round >= 10 then perform public._duel_cards_finish(p_id); end if;
end; $$;

-- ------------------------------------------------------------
-- RPCs públicas
-- ------------------------------------------------------------

-- Buscar partida (empareja por apuesta exacta) o quedar en espera
create or replace function public.duel_cards_search(p_stake bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record; v_id uuid; v_sq jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_stake < 0 or p_stake > 100000 then raise exception 'apuesta inválida'; end if;

  v_sq := public._duel_cards_squad(v_user);
  if v_sq is null or jsonb_array_length(v_sq) <> 10 then
    raise exception 'necesitás el once completo (10 de campo + arquero)';
  end if;

  if exists (select 1 from public.duel_cards_matches
             where status in ('waiting','active') and (p1 = v_user or p2 = v_user)) then
    -- Ya está adentro de una: devolverla (reconexión)
    select id into v_id from public.duel_cards_matches
      where status in ('waiting','active') and (p1 = v_user or p2 = v_user) limit 1;
    return jsonb_build_object('match_id', v_id);
  end if;

  -- ¿Hay alguien esperando con la misma apuesta?
  select * into m from public.duel_cards_matches
    where status = 'waiting' and code is null and stake = p_stake and p1 <> v_user
    order by created_at limit 1 for update skip locked;

  if found then
    perform public._duel_cards_hold(v_user, p_stake, m.id::text);
    update public.duel_cards_matches set
      p2 = v_user, p2_cards = v_sq, status = 'active',
      categories = public._duel_cards_categories(),
      round = 1, deadline = now() + interval '18 seconds'
      where id = m.id;
    return jsonb_build_object('match_id', m.id);
  end if;

  perform public._duel_cards_hold(v_user, p_stake, 'waiting');
  insert into public.duel_cards_matches (p1, stake, p1_cards)
    values (v_user, p_stake, v_sq) returning id into v_id;
  update public.coin_ledger set ref = v_id::text
    where user_id = v_user and reason = 'cardduel_hold' and ref = 'waiting';
  return jsonb_build_object('match_id', v_id);
end; $$;
revoke all on function public.duel_cards_search(bigint) from public;
grant execute on function public.duel_cards_search(bigint) to authenticated;

-- Sala privada con código para compartir
create or replace function public.duel_cards_create_room(p_stake bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_code text; v_sq jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_stake < 0 or p_stake > 100000 then raise exception 'apuesta inválida'; end if;
  v_sq := public._duel_cards_squad(v_user);
  if v_sq is null or jsonb_array_length(v_sq) <> 10 then
    raise exception 'necesitás el once completo (10 de campo + arquero)';
  end if;
  if exists (select 1 from public.duel_cards_matches
             where status in ('waiting','active') and (p1 = v_user or p2 = v_user)) then
    raise exception 'ya estás en una partida';
  end if;

  v_code := upper(substr(md5(random()::text), 1, 5));
  perform public._duel_cards_hold(v_user, p_stake, 'waiting');
  insert into public.duel_cards_matches (p1, stake, p1_cards, code)
    values (v_user, p_stake, v_sq, v_code) returning id into v_id;
  update public.coin_ledger set ref = v_id::text
    where user_id = v_user and reason = 'cardduel_hold' and ref = 'waiting';
  return jsonb_build_object('match_id', v_id, 'code', v_code);
end; $$;
revoke all on function public.duel_cards_create_room(bigint) from public;
grant execute on function public.duel_cards_create_room(bigint) to authenticated;

-- Entrar con código (la apuesta es la de la sala)
create or replace function public.duel_cards_join_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record; v_sq jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  v_sq := public._duel_cards_squad(v_user);
  if v_sq is null or jsonb_array_length(v_sq) <> 10 then
    raise exception 'necesitás el once completo (10 de campo + arquero)';
  end if;

  select * into m from public.duel_cards_matches
    where code = upper(trim(p_code)) and status = 'waiting' for update;
  if not found then raise exception 'sala no encontrada (o ya empezó)'; end if;
  if m.p1 = v_user then raise exception 'esa sala es tuya'; end if;

  perform public._duel_cards_hold(v_user, m.stake, m.id::text);
  update public.duel_cards_matches set
    p2 = v_user, p2_cards = v_sq, status = 'active',
    categories = public._duel_cards_categories(),
    round = 1, deadline = now() + interval '18 seconds'
    where id = m.id;
  return jsonb_build_object('match_id', m.id);
end; $$;
revoke all on function public.duel_cards_join_code(text) from public;
grant execute on function public.duel_cards_join_code(text) to authenticated;

-- Cancelar la espera (devuelve la apuesta)
create or replace function public.duel_cards_cancel()
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into m from public.duel_cards_matches
    where status = 'waiting' and p1 = v_user for update;
  if not found then return; end if;
  perform public._duel_cards_pay(v_user, m.stake, 'cardduel_refund', m.id::text);
  update public.duel_cards_matches set status = 'cancelled' where id = m.id;
end; $$;
revoke all on function public.duel_cards_cancel() from public;
grant execute on function public.duel_cards_cancel() to authenticated;

-- Elegir carta (secreto; resuelve la ronda si el rival ya eligió)
create or replace function public.duel_cards_pick(p_match uuid, p_idx int)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record; v_p1 boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into m from public.duel_cards_matches where id = p_match for update;
  if not found or m.status <> 'active' then raise exception 'partida no activa'; end if;
  if v_user <> m.p1 and v_user <> m.p2 then raise exception 'no es tu partida'; end if;
  v_p1 := v_user = m.p1;

  if p_idx < 0 or p_idx > 9 then raise exception 'carta inválida'; end if;
  if (v_p1 and m.p1_used @> to_jsonb(p_idx)) or ((not v_p1) and m.p2_used @> to_jsonb(p_idx)) then
    raise exception 'esa carta ya la usaste';
  end if;
  if (v_p1 and m.p1_pick is not null) or ((not v_p1) and m.p2_pick is not null) then
    raise exception 'ya elegiste esta ronda';
  end if;

  if v_p1 then update public.duel_cards_matches set p1_pick = p_idx where id = p_match;
  else update public.duel_cards_matches set p2_pick = p_idx where id = p_match;
  end if;

  perform public._duel_cards_resolve(p_match);
end; $$;
revoke all on function public.duel_cards_pick(uuid, int) from public;
grant execute on function public.duel_cards_pick(uuid, int) to authenticated;

-- Reloj: pasado el deadline, el servidor elige al azar por el ausente
create or replace function public.duel_cards_tick(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; v_idx int;
begin
  select * into m from public.duel_cards_matches where id = p_match for update;
  if not found or m.status <> 'active' then return; end if;
  if m.deadline is null or now() < m.deadline then return; end if;

  if m.p1_pick is null then
    select i into v_idx from generate_series(0, 9) i
      where not (m.p1_used @> to_jsonb(i)) order by random() limit 1;
    update public.duel_cards_matches set p1_pick = v_idx where id = p_match;
  end if;
  if m.p2_pick is null then
    select i into v_idx from generate_series(0, 9) i
      where not (m.p2_used @> to_jsonb(i)) order by random() limit 1;
    update public.duel_cards_matches set p2_pick = v_idx where id = p_match;
  end if;
  perform public._duel_cards_resolve(p_match);
end; $$;
revoke all on function public.duel_cards_tick(uuid) from public;
grant execute on function public.duel_cards_tick(uuid) to authenticated;

-- Abandonar = derrota automática
create or replace function public.duel_cards_forfeit(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record; v_pot bigint; v_fee bigint; v_winner uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into m from public.duel_cards_matches where id = p_match for update;
  if not found or m.status <> 'active' then return; end if;
  if v_user <> m.p1 and v_user <> m.p2 then raise exception 'no es tu partida'; end if;

  v_winner := case when v_user = m.p1 then m.p2 else m.p1 end;
  v_pot := m.stake * 2;
  v_fee := case when v_pot > 0 then greatest(1, (v_pot * 0.05)::bigint) else 0 end;
  perform public._duel_cards_pay(v_winner, v_pot - v_fee, 'cardduel_win', p_match::text);
  update public.duel_cards_matches set status = 'done', winner = v_winner where id = p_match;
end; $$;
revoke all on function public.duel_cards_forfeit(uuid) from public;
grant execute on function public.duel_cards_forfeit(uuid) to authenticated;

-- Estado saneado: NUNCA expone la mano del rival sin revelar
create or replace function public.duel_cards_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m record; v_p1 boolean; v_rival uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into m from public.duel_cards_matches where id = p_match;
  if not found then raise exception 'partida no encontrada'; end if;
  if v_user <> m.p1 and (m.p2 is null or v_user <> m.p2) then
    raise exception 'no es tu partida';
  end if;
  v_p1 := v_user = m.p1;
  v_rival := case when v_p1 then m.p2 else m.p1 end;

  return jsonb_build_object(
    'match_id', m.id,
    'status', m.status,
    'code', case when v_p1 then m.code end,
    'stake', m.stake,
    'round', m.round,
    'deadline', m.deadline,
    'seconds_left', case when m.deadline is null then null
      else greatest(0, extract(epoch from m.deadline - now()))::int end,
    'category', case when m.status = 'active' then m.categories -> (m.round - 1) end,
    'my_cards', case when v_p1 then m.p1_cards else m.p2_cards end,
    'my_used', case when v_p1 then m.p1_used else m.p2_used end,
    'my_pick', case when v_p1 then m.p1_pick else m.p2_pick end,
    'rival_picked', case when v_p1 then m.p2_pick is not null else m.p1_pick is not null end,
    'my_score', case when v_p1 then m.p1_score else m.p2_score end,
    'rival_score', case when v_p1 then m.p2_score else m.p1_score end,
    'my_side', case when v_p1 then 'p1' else 'p2' end,
    'rounds', m.rounds,
    'winner', case when m.winner is null then null
      when m.winner = v_user then 'me' else 'rival' end,
    'rival_name', (select club_name from public.profiles where id = v_rival)
  );
end; $$;
revoke all on function public.duel_cards_state(uuid) from public;
grant execute on function public.duel_cards_state(uuid) to authenticated;

-- Reconexión: mi partida en curso (si hay)
create or replace function public.duel_cards_mine()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.duel_cards_matches
  where status in ('waiting','active') and (p1 = auth.uid() or p2 = auth.uid())
  order by created_at desc limit 1;
$$;
revoke all on function public.duel_cards_mine() from public;
grant execute on function public.duel_cards_mine() to authenticated;

select 'duelo de cartas listo' as resultado;
