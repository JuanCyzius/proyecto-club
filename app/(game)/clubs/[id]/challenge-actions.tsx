"use client";

import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reto de penales dirigido a este club (el 1v1 vuelve con el PvP nuevo). */
export function ChallengeActions({
  targetId,
  targetName,
}: {
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
      <p className="text-xs font-semibold text-muted">Retar a {targetName}</p>
      <Button
        fullWidth
        variant="secondary"
        onClick={() => router.push(`/duels?rival=${targetId}`)}
      >
        <Target size={15} /> Duelo de penales
      </Button>
      <p className="text-[10px] text-muted">
        El duelo dirigido solo lo puede aceptar él y le aparece marcado.
      </p>
    </div>
  );
}
