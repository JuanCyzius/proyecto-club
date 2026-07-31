"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/layout";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { fetchChat, sendChat, markChatRead, type ChatMsg } from "./actions";

function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ChatView({ initial }: { initial: ChatMsg[] }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(initial[initial.length - 1]?.id ?? 0);

  // Abrir el chat = marcar leído y apagar la burbuja de la barra al
  // instante (antes quedaba encendida hasta el siguiente sondeo).
  useEffect(() => {
    markChatRead();
    window.dispatchEvent(new Event("chat:read"));
    // También al salir, por si llegaron mensajes mientras leías
    return () => {
      markChatRead();
      window.dispatchEvent(new Event("chat:read"));
    };
  }, []);

  // El chat llega por WebSocket (Supabase Realtime): el navegador
  // mantiene una conexión abierta y el servidor avisa cuando entra un
  // mensaje. Con el chat quieto no se hace NINGUNA solicitud; antes se
  // preguntaba cada 6-60 segundos aunque no pasara nada.
  //
  // Se conserva una red de seguridad cada 5 minutos por si la conexión
  // se cae sin avisar (túnel, cambio de red, suspensión del teléfono).
  useEffect(() => {
    let alive = true;

    const pull = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      const list = await fetchChat();
      if (!alive) return;
      const newest = list[list.length - 1]?.id ?? 0;
      if (newest !== lastId.current) {
        lastId.current = newest;
        setMsgs(list);
        markChatRead();
        window.dispatchEvent(new Event("chat:read"));
      }
    };

    const supabase = createBrowserClient();
    const channel = supabase
      .channel("chat-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => {
          // Llegó un mensaje: se traen los últimos (una sola solicitud,
          // y solo cuando de verdad hay algo nuevo).
          pull();
        }
      )
      .subscribe();

    // Al volver a la pestaña, sincronizar por si se perdió algo
    const onVis = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVis);

    const safety = setInterval(pull, 300_000);

    return () => {
      alive = false;
      clearInterval(safety);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll al fondo con cada mensaje nuevo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);
    const res = await sendChat(body);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar.");
      return;
    }
    setText("");
    const list = await fetchChat();
    lastId.current = list[list.length - 1]?.id ?? 0;
    setMsgs(list);
    markChatRead();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-surface p-3 [-webkit-overflow-scrolling:touch]">
        <p className="pb-1 text-center text-[10px] text-muted">
          Se guardan los últimos 100 mensajes de las últimas 24 horas.
        </p>
        {msgs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            Nadie escribió todavía. Rompé el hielo.
          </p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3 py-1.5",
                m.mine
                  ? "rounded-br-sm bg-turf-soft/40 text-text"
                  : "rounded-bl-sm border border-border bg-surface-2"
              )}
            >
              {!m.mine && (
                <p className="text-[10px] font-bold text-turf">{m.club_name}</p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              <p className="text-right text-[9px] text-muted">{hhmm(m.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Escribí un mensaje…"
          maxLength={300}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-turf/60"
        />
        <button
          onClick={submit}
          disabled={sending || !text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-turf text-turf-ink disabled:opacity-40"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
