-- ============================================================
-- CHAT GLOBAL
--
-- Un solo canal para todo el juego. Mensajes de hasta 300
-- caracteres, con freno anti-spam (1 mensaje cada 2 segundos por
-- usuario). Los "no leídos" se calculan contra la última vez que
-- abriste el chat (chat_reads) y viajan en nav_counts() para la
-- burbuja de la barra; al abrir el chat se marca leído y la
-- burbuja vuelve a cero.
-- ============================================================

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_recent on public.chat_messages (created_at desc);
alter table public.chat_messages enable row level security;
drop policy if exists "chat_read" on public.chat_messages;
create policy "chat_read" on public.chat_messages
  for select using (auth.uid() is not null);
-- Escritura solo vía RPC (valida y frena spam).

create table if not exists public.chat_reads (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.chat_reads enable row level security;
drop policy if exists "chat_reads_own" on public.chat_reads;
create policy "chat_reads_own" on public.chat_reads
  for select using (auth.uid() = user_id);

-- Enviar (con freno de 2 segundos)
create or replace function public.chat_send(p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_body text := trim(p_body);
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if char_length(v_body) < 1 then raise exception 'mensaje vacío'; end if;
  if char_length(v_body) > 300 then raise exception 'máximo 300 caracteres'; end if;
  if exists (select 1 from public.chat_messages
             where user_id = v_user and created_at > now() - interval '2 seconds') then
    raise exception 'esperá un toque entre mensajes';
  end if;
  insert into public.chat_messages (user_id, body) values (v_user, v_body);
end; $$;
revoke all on function public.chat_send(text) from public;
grant execute on function public.chat_send(text) to authenticated;

-- Últimos mensajes con nombre de club (para no exponer profiles entero)
create or replace function public.chat_fetch(p_limit int default 60)
returns TABLE("id" bigint, "body" text, "created_at" timestamptz,
              "club_name" text, "mine" boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.body, m.created_at, p.club_name, m.user_id = auth.uid()
  from public.chat_messages m
  join public.profiles p on p.id = m.user_id
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.chat_fetch(int) to authenticated;

-- Abrir el chat = marcar todo como leído (resetea la burbuja)
create or replace function public.chat_mark_read()
returns void language sql security definer set search_path = public as $$
  insert into public.chat_reads (user_id, last_seen_at)
    values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now();
$$;
revoke all on function public.chat_mark_read() from public;
grant execute on function public.chat_mark_read() to authenticated;

-- nav_counts ahora también devuelve los mensajes sin leer (tope 99,
-- sin contar los tuyos)
create or replace function public.nav_counts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_last timestamptz;
  v_online int; v_invites int; v_chat int; v_read timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('online', 0, 'invites', 0, 'chat', 0);
  end if;

  select last_seen into v_last from public.profiles where id = v_user;
  if v_last is null or now() - v_last >= interval '60 seconds' then
    update public.profiles set last_seen = now() where id = v_user;
  end if;

  select count(*)::int into v_online from public.profiles
    where last_seen > now() - interval '3 minutes';

  select count(*)::int into v_invites from public.penalty_duels
    where status = 'open' and target = v_user;

  select last_seen_at into v_read from public.chat_reads where user_id = v_user;
  select least(count(*), 99)::int into v_chat from public.chat_messages
    where user_id <> v_user
      and created_at > coalesce(v_read, now() - interval '7 days');

  return jsonb_build_object(
    'online', v_online,
    'invites', coalesce(v_invites, 0),
    'chat', coalesce(v_chat, 0)
  );
end; $$;
revoke all on function public.nav_counts() from public;
grant execute on function public.nav_counts() to authenticated;

select 'chat global listo' as resultado;
