-- ============================================================
-- CHAT LIVIANO: LIMPIEZA AUTOMÁTICA
--
-- Objetivo: que la tabla NUNCA crezca. Dos reglas combinadas, las
-- dos aplicadas al enviar (sin cron, sin tareas de fondo):
--   1. Se borra todo lo de más de 24 horas.
--   2. Se conservan como mucho los últimos 100 mensajes: al entrar
--      el 101, se borra el más viejo, y así siempre.
--
-- Con esto la tabla se estabiliza en ~100 filas (unos pocos KB),
-- así el plan gratuito de Supabase no se toca ni de cerca.
-- ============================================================

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

  -- Regla 1: nada más viejo que 24 horas
  delete from public.chat_messages where created_at < now() - interval '24 hours';

  -- Regla 2: tope de 100 mensajes (se cae el más viejo)
  delete from public.chat_messages
  where id in (
    select id from public.chat_messages
    order by created_at desc
    offset 100
  );
end; $$;
revoke all on function public.chat_send(text) from public;
grant execute on function public.chat_send(text) to authenticated;

-- Limpieza de lo que ya se acumuló hasta ahora
delete from public.chat_messages where created_at < now() - interval '24 hours';
delete from public.chat_messages
where id in (select id from public.chat_messages order by created_at desc offset 100);

select count(*) as mensajes_en_el_chat from public.chat_messages;
