"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Swords, Target, Check } from "lucide-react";
import { Notice } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { sendFriendlyChallenge } from "./actions";

/**
 * Botones para retar a este club: amistoso 1v1 (queda como partido
 * pendiente que el rival ve en Ligas) o duelo de penales dirigido.
 */
export function ChallengeActions({
  targetId,
  targetName,
}: {
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function challenge1v1() {
    setError(null);
    start(async () => {
      const res = await sendFriendlyChallenge(targetId);
      if (res.ok) setSent(true);
      else setError(res.error ?? "No se pudo enviar el reto.");
    });
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
      <p className="text-xs font-semibold text-muted">
        Retar a {targetName}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        {sent ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl border border-turf/40 bg-turf-soft/20 px-3 py-2.5 text-sm font-bold text-turf">
            <Check size={15} /> Reto enviado
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={challenge1v1}
          >
            <Swords size={15} />
            {pending ? "Enviando…" : "Retar 1v1"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => router.push(`/duels?rival=${targetId}`)}
        >
          <Target size={15} /> Penales
        </Button>
      </div>
      <p className="text-[10px] text-muted">
        El 1v1 le aparece al rival en sus partidos por jugar. El duelo de
        penales dirigido solo lo puede aceptar él.
      </p>
    </div>
  );
}
