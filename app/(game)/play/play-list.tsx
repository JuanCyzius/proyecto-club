"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/layout";
import { Swords, Zap, Coins, Shuffle, ChevronRight, Target, Gamepad2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startLiveMatch, resumeLiveMatch, type LiveResult } from "./live-actions";
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

export function TierList({
  tiers,
  ongoing,
}: {
  tiers: Tier[];
  ongoing?: { awayName: string; score: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Extract<LiveResult, { ok: true }> | null>(
    null
  );

  function resume() {
    setError(null);
    setBusy("resume");
    start(async () => {
      const res = await resumeLiveMatch();
      if (res.ok) setLive(res);
      else {
        setError(res.error);
        setBusy(null);
      }
    });
  }

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
        onExit={() => {
          // Volver al listado y traer el saldo y la energía actualizados
          setLive(null);
          setBusy(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Partido en curso: sigue corriendo aunque cambies de pestaña */}
      {ongoing && (
        <button
          onClick={resume}
          disabled={pending}
          className="flex w-full items-center gap-3 rounded-2xl border border-turf bg-turf-soft/25 p-3 text-left disabled:opacity-60"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-turf opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-turf" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-turf">
              Tenés un partido en curso
            </span>
            <span className="block truncate text-xs text-muted">
              vs {ongoing.awayName} · {ongoing.score}
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-turf">
            {busy === "resume" ? "Volviendo…" : "Volver →"}
          </span>
        </button>
      )}

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

      {/* Tanda de penales PvP */}
      <Link
        href="/duels"
        className="flex items-center gap-3 rounded-2xl border border-turf/40 bg-turf-soft/15 p-3 transition hover:border-turf"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-turf/20 text-turf">
          <Target size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-turf">Tanda de penales</span>
          <span className="block text-xs text-muted">
            Desafiá a otro club. Podés apostar monedas o un jugador.
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>

      {/* Duelo de Cartas */}
      <Link
        href="/duel-cards"
        className="flex items-center gap-3 rounded-2xl border border-sky-400/40 bg-sky-400/10 p-3 transition hover:border-sky-400"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-400/20 text-sky-400">
          <Layers size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-sky-400">Duelo de Cartas</span>
          <span className="block text-xs text-muted">
            PvP en vivo: 10 rondas de estrategia con tus cartas. Apostá si querés.
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>

      {/* PvP Arcade */}
      <Link
        href="/pvp-lab"
        className="flex items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 transition hover:border-danger"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-danger/20 text-danger">
          <Gamepad2 size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-danger">PvP Arcade (beta)</span>
          <span className="block text-xs text-muted">
            8 jugadas a pura habilidad: joystick, sprint y un botón. Suma rating.
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
