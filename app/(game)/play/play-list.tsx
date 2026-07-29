"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/ui/layout";
import { Swords, Zap, Dices, Coins, Shuffle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startLiveMatch, type LiveResult } from "./live-actions";
import { LiveMatch } from "./live-match";

export type Tier = {
  code: string;
  name: string;
  subtitle: string;
  min_rating: number;
  max_rating: number;
  reward_mult: number;
};

// Color según lo duro que es el nivel
function tierStyle(max: number) {
  if (max >= 97) return { text: "text-trophy", ring: "border-trophy/50", bg: "bg-trophy/10" };
  if (max >= 91) return { text: "text-trophy", ring: "border-trophy/40", bg: "bg-trophy/5" };
  if (max >= 86) return { text: "text-danger", ring: "border-danger/40", bg: "bg-danger/5" };
  if (max >= 76) return { text: "text-turf", ring: "border-turf/40", bg: "bg-turf-soft/20" };
  if (max >= 66) return { text: "text-sky-400", ring: "border-sky-400/30", bg: "" };
  return { text: "text-muted", ring: "border-border", bg: "" };
}

export function TierList({ tiers }: { tiers: Tier[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Extract<LiveResult, { ok: true }> | null>(
    null
  );

  function play(code: string) {
    setError(null);
    setBusy(code);
    start(async () => {
      const res = await startLiveMatch(code);
      if (res.ok) setLive(res);
      else {
        setError(res.error);
        setBusy(null);
      }
    });
  }

  if (live) {
    return (
      <LiveMatch
        matchId={live.matchId}
        initialEvents={live.events}
        initialView={live.view}
        initialDecision={live.decision}
        initialFinished={live.finished}
        initialReward={live.reward ?? null}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-turf/30 bg-turf-soft/25 px-3 py-2.5">
        <Dices size={16} className="mt-0.5 shrink-0 text-turf" />
        <p className="text-xs text-muted">
          No sabés contra quién jugás hasta que arranca el partido. Te toca un{" "}
          <b className="text-text">club real al azar</b> de ese nivel, con su
          plantilla y su táctica.
        </p>
      </div>

      {/* Modo Draft */}
      <Link
        href="/draft"
        className="flex items-center gap-3 rounded-2xl border border-trophy/40 bg-trophy-soft/15 p-3 transition hover:border-trophy"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-trophy/20 text-trophy">
          <Shuffle size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-trophy">Draft</span>
          <span className="block text-xs text-muted">
            Armá un equipo de cracks y ganá 5 partidos por premios grandes.
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>

      <p className="eyebrow px-1 pt-1">Partido rápido</p>

      {error && (
        <Notice tone="error">{error}</Notice>
      )}

      {tiers.map((t) => {
        const st = tierStyle(t.max_rating);
        return (
          <Card key={t.code} className={cn(st.ring, st.bg)}>
            <CardBody className="flex items-center gap-3 py-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-surface-2",
                  st.text
                )}
              >
                <span className="font-display text-lg font-extrabold leading-none">
                  {t.max_rating}
                </span>
                <span className="text-[8px] uppercase tracking-wide text-muted">
                  nivel
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("font-bold leading-tight", st.text)}>
                  {t.name}
                </p>
                <p className="text-xs text-muted">{t.subtitle}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                  <Coins size={10} className="text-trophy" />
                  Rivales de {t.min_rating} a {t.max_rating}
                </p>
              </div>
              <Button size="sm" onClick={() => play(t.code)} disabled={pending}>
                <Swords size={15} />
                {busy === t.code ? "Sorteando…" : "Jugar"}
              </Button>
            </CardBody>
          </Card>
        );
      })}

      <div className="flex items-start gap-2 px-1 pt-1">
        <Zap size={14} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-[11px] text-muted">
          Cuanto más duro el nivel, más monedas pagan la victoria y el empate.
        </p>
      </div>
    </div>
  );
}
