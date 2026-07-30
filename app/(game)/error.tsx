"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Red de seguridad: si una pantalla falla, en vez de dejar la página en
 * blanco se muestra un aviso con salida. El error real va a la consola
 * y a los registros del servidor.
 */
export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en pantalla:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-danger/30 bg-surface px-6 py-12 text-center shadow-e2">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle size={22} />
      </div>
      <div>
        <p className="font-semibold">Algo salió mal en esta pantalla</p>
        <p className="mx-auto mt-1 max-w-[38ch] text-sm leading-snug text-muted">
          El resto del juego sigue funcionando. Probá de nuevo o volvé al club.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10px] text-muted-2">
            {error.digest}
          </p>
        )}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button fullWidth onClick={reset}>
          <RotateCw size={16} /> Reintentar
        </Button>
        <Link href="/club">
          <Button fullWidth variant="secondary">
            <Home size={16} /> Volver al club
          </Button>
        </Link>
      </div>
    </div>
  );
}
