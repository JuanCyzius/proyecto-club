"use client";

import { useEffect } from "react";

/** Registra el service worker solo en producción. */
export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin service worker el juego funciona igual: no molestamos al usuario.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
