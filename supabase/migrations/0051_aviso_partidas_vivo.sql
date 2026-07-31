-- ============================================================
-- AVISO DE PARTIDAS EN VIVO BUSCANDO RIVAL
--
-- nav_counts() ahora también informa cuántas salas del Duelo de
-- Cartas están esperando rival (sin contar las propias), para
-- mostrar un globito en "Jugar" cuando alguien puso una partida.
-- Va en la misma llamada que ya se hacía: cero solicitudes extra.
-- ============================================================

create or replace function public.nav_counts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_last timestamptz;
  v_online int; v_invites int; v_chat int; v_read timestamptz; v_live int;
begin
  if v_user is null then
    return jsonb_build_object('online', 0, 'invites', 0, 'chat', 0, 'live', 0);
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

  -- Salas del Duelo de Cartas esperando rival (recientes, no propias)
  select count(*)::int into v_live from public.duel_cards_matches
    where status = 'waiting'
      and p1 <> v_user
      and created_at > now() - interval '30 minutes';

  return jsonb_build_object(
    'online', v_online,
    'invites', coalesce(v_invites, 0),
    'chat', coalesce(v_chat, 0),
    'live', coalesce(v_live, 0)
  );
end; $$;
revoke all on function public.nav_counts() from public;
grant execute on function public.nav_counts() to authenticated;

select 'aviso de partidas en vivo listo' as resultado;
