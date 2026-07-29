"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, AlertTriangle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { claimWelcome } from "../packs/actions";

export function StarterEmpty({ templateCount }: { templateCount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Sin catálogo no hay jugadores que repartir: avisamos antes de intentar.
  if (templateCount === 0) {
    return (
      <Card>
        <CardBody className="space-y-3 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
            <AlertTriangle size={22} />
          </div>
          <p className="font-semibold">El catálogo está vacío</p>
          <p className="text-sm text-muted">
            No hay jugadores cargados en la base, así que no se puede repartir
            ningún plantel.
          </p>
          <div className="mx-auto max-w-sm rounded-lg border border-border bg-surface-2 p-3 text-left text-xs text-muted">
            <p className="mb-1 font-semibold text-text">Para solucionarlo:</p>
            <p>1. Ejecutá las migraciones 0008 y 0009</p>
            <p>
              2. Importá <code>players_22.csv</code> siguiendo{" "}
              <code>supabase/import/README.md</code>
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft text-turf">
          <Gift size={22} />
        </div>
        <div>
          <p className="font-semibold">Reclamá tu plantel inicial</p>
          <p className="mt-1 text-sm text-muted">
            Un pack de bienvenida con 27 jugadores para armar tu primer once.
          </p>
        </div>
        <Button
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await claimWelcome();
              if (res.ok) router.refresh();
              else setError(res.error ?? "No se pudo reclamar el plantel.");
            })
          }
          disabled={pending}
        >
          {pending ? "Abriendo…" : "Abrir sobre de bienvenida"}
        </Button>
        {error && (
          <p
            role="alert"
            className="max-w-sm rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
