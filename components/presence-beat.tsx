"use client";

import { useEffect } from "react";
import { touchPresence } from "@/app/(game)/online/actions";

/**
 * Avisa que el usuario está activo. Late cada 2 minutos y solo mientras
 * la pestaña está visible: si el usuario deja el juego abierto de fondo,
 * deja de contar como conectado y no gasta llamadas.
 */
export function PresenceBeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => {
      if (document.visibilityState === "visible") {
        touchPresence().catch(() => {
          // La presencia es cosmética: si falla, no molestamos al usuario.
        });
      }
    };

    beat();
    timer = setInterval(beat, 120_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
