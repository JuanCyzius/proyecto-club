"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/layout";
import { fetchChat, sendChat, markChatRead, type ChatMsg } from "./actions";

/** Sondeo escalonado: rápido si hay charla, lento si está quieto. */
const MIN_DELAY = 6_000;
const MAX_DELAY = 60_000;

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

  // Sondeo del chat, escalonado para no castigar al servidor:
  //   - arranca cada 6 s mientras hay conversación;
  //   - si no llega nada nuevo, el intervalo se va estirando hasta 60 s;
  //   - vuelve a 6 s en cuanto aparece un mensaje o el usuario escribe;
  //   - se detiene del todo con la pestaña oculta (antes seguía el
  //     temporizador aunque descartara la respuesta).
  // Además "marcar leído" ya no viaja en cada ciclo: solo cuando de
  // verdad hubo mensajes nuevos.
  const delay = useRef(MIN_DELAY);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(run, delay.current);
    };

    const run = async () => {
      if (!alive) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      const list = await fetchChat();
      if (!alive) return;
      const newest = list[list.length - 1]?.id ?? 0;
      if (newest !== lastId.current) {
        lastId.current = newest;
        setMsgs(list);
        markChatRead();
        window.dispatchEvent(new Event("chat:read"));
        delay.current = MIN_DELAY; // hay charla: volvemos a mirar seguido
      } else {
        delay.current = Math.min(MAX_DELAY, Math.round(delay.current * 1.6));
      }
      schedule();
    };

    // Al volver a la pestaña, mirar enseguida
    const onVis = () => {
      if (document.visibilityState === "visible") delay.current = MIN_DELAY;
    };
    document.addEventListener("visibilitychange", onVis);

    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
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
    delay.current = MIN_DELAY;
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
