-- ============================================================
-- CHAT POR WEBSOCKET (Supabase Realtime)
--
-- Se publica la tabla del chat para que los navegadores reciban los
-- mensajes nuevos por una conexión persistente, en lugar de estar
-- preguntando cada pocos segundos.
--
-- Efecto: cuando el chat está quieto, CERO solicitudes; cuando
-- alguien escribe, llega al instante. Antes se consultaba de 6 a 60
-- segundos aunque no pasara nada.
--
-- Nota: la lectura sigue protegida por la política de RLS existente
-- (solo usuarios autenticados), y escribir sigue pasando únicamente
-- por chat_send(), con su freno anti-spam. Publicar la tabla no
-- habilita a nadie a insertar directo.
-- ============================================================

do $$
begin
  -- La publicación existe por defecto en Supabase; si no, se crea.
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  -- Agregar la tabla solo si todavía no está publicada
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

select 'chat en tiempo real habilitado' as resultado;
