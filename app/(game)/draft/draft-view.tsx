"use client";

import { useEffect, useState, useTransition } from "react";
import { Flag } from "@/components/ui/flag";
import { Portrait } from "@/components/player-card/portrait";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import {
  Shuffle,
  Coins,
  Trophy,
  Swords,
  Check,
  X,
  Package,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClubCrest } from "@/components/club/club-crest";
import { RARITY_LABEL, type Rarity } from "@/lib/players";
import {
  abandonDraft,
  finishDraftMatch,
  pickPlayer,
  playDraftMatch,
  startDraft,
} from "./actions";
import { DraftLineup } from "./draft-lineup";
import { LiveMatch } from "../play/live-match";
import type { LiveResult } from "../play/live-actions";
import type { DraftCandidate, DraftState, PackCredit } from "./types";

const RARITY_DOT: Record<Rarity, string> = {
  common: "bg-[#8a5a2b]",
  uncommon: "bg-[#aab7c2]",
  rare: "bg-[#ecc65e]",
  epic: "bg-[#6f86ff]",
  legendary: "bg-[#ff5b6e]",
  icon: "bg-[#f6e7b3]",
};

const PACK_LABEL: Record<string, string> = {
  bronze: "Sobre Bronce",
  silver: "Sobre Plata",
  gold: "Sobre Oro",
  special: "Sobre Especial",
};

export function DraftView({
  initial,
  entryCoins,
  rewards,
  coins,
  credits,
  runsToday,
  maxRunsPerDay,
}: {
  initial: DraftState | null;
  entryCoins: number;
  rewards: Record<string, { coins: number; packs: string[] }>;
  coins: number;
  credits: PackCredit[];
  runsToday: number;
  maxRunsPerDay: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<DraftState | null>(initial);
  // router.refresh() trae "initial" actualizado del servidor, pero
  // useState solo lo toma la primera vez que se monta el componente.
  // Sin esto, había que salir y volver a entrar para ver los cambios.
  useEffect(() => {
    setState(initial);
  }, [initial]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [live, setLive] = useState<LiveResult | null>(null);
  // Al terminar el sorteo se abre el armado del equipo
  const [showLineup, setShowLineup] = useState(false);
  const [lastMatch, setLastMatch] = useState<{
    won: boolean;
    home: number;
    away: number;
    finished: boolean;
    reward?: { coins: number; packs: string[] };
  } | null>(null);

  function begin() {
    setError(null);
    setBusy("start");
    start(async () => {
      const res = await startDraft();
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function choose(index: number) {
    if (!state) return;
    setError(null);
    setBusy(`pick${index}`);
    start(async () => {
      const res = await pickPlayer(state.run_id, index);
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function playMatch() {
    if (!state) return;
    setError(null);
    setBusy("match");
    setLastMatch(null);
    start(async () => {
      const res = await playDraftMatch(state.run_id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLive(res);
    });
  }

  // ── PARTIDO EN VIVO DEL DRAFT ──
  if (live && live.ok) {
    return (
      <LiveMatch
        matchId={live.matchId}
        initialEvents={live.events}
        initialView={live.view}
        initialDecision={live.decision}
        initialFinished={live.finished}
        initialReward={live.reward ?? null}
        onExit={() => {
          // Al salir se registra el resultado en el draft y se refresca
          finishDraftMatch(live.matchId).then(() => {
            setLive(null);
            setBusy(null);
            router.refresh();
          });
        }}
      />
    );
  }

  // ── SIN DRAFT ACTIVO ──
  if (!state) {
    return (
      <div className="space-y-4">
        {credits.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-trophy/40 bg-trophy-soft/20 p-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-trophy">
              <Package size={15} /> Tenés {credits.length} sobre
              {credits.length > 1 ? "s" : ""} ganado{credits.length > 1 ? "s" : ""}
            </p>
            <Button fullWidth size="sm" onClick={() => router.push("/packs")}>
              Ir a la Tienda para abrirlo{credits.length > 1 ? "s" : ""}
            </Button>
          </div>
        )}

        {error && (
          <Notice tone="error">{error}</Notice>
        )}

        <Card className="border-turf/40 bg-turf-soft/10">
          <CardBody className="space-y-3 py-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-turf/20 text-turf">
              <Shuffle size={26} />
            </div>
            <div>
              <p className="font-display text-xl font-extrabold">Draft</p>
              <p className="mt-1 text-sm text-muted">
                Armá un once eligiendo entre 5 cracks por puesto y ganá hasta 5
                partidos seguidos. Una derrota y se termina.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
              <Coins size={16} className="text-trophy" />
              <span className="text-sm text-muted">Entrada</span>
              <span className="ml-auto font-display text-lg font-extrabold">
                {entryCoins.toLocaleString("es")}
              </span>
            </div>
            <p className="text-center text-xs text-muted">
              Drafts jugados hoy: {runsToday}/{maxRunsPerDay}
            </p>
            <Button
              fullWidth
              size="lg"
              disabled={pending || coins < entryCoins || runsToday >= maxRunsPerDay}
              onClick={begin}
            >
              <Shuffle size={17} />
              {runsToday >= maxRunsPerDay
                ? "Ya jugaste 3 hoy"
                : coins < entryCoins
                  ? "Saldo insuficiente"
                  : busy === "start"
                    ? "Empezando…"
                    : "Entrar al draft"}
            </Button>
          </CardBody>
        </Card>

        {/* Tabla de premios */}
        <div>
          <p className="eyebrow mb-2 px-1">Recompensas</p>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {Object.entries(rewards).map(([wins, r]) => {
              const w = Number(wins);
              return (
                <div
                  key={wins}
                  className={cn(
                    "flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0",
                    w >= 4 && "bg-trophy-soft/15"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-sm font-extrabold",
                      w >= 4
                        ? "bg-trophy/20 text-trophy"
                        : w >= 2
                          ? "bg-turf-soft text-turf"
                          : "bg-surface-2 text-muted"
                    )}
                  >
                    {wins}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {w === 0
                      ? "Sin victorias"
                      : `${wins} victoria${w > 1 ? "s" : ""}`}
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-trophy">
                      {r.coins.toLocaleString("es")}
                    </span>
                    {r.packs.length > 0 && (
                      <span className="text-[10px] text-muted">
                        {r.packs.map((p) => PACK_LABEL[p] ?? p).join(" + ")}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-[11px] text-muted">
            Con 2 victorias recuperás la entrada. A partir de ahí, ganancia.
          </p>
        </div>
      </div>
    );
  }

  // ── ARMANDO EL EQUIPO (antes de cada partido) ──
  if (state.status === "playing" && showLineup) {
    const asMap: Record<string, number> = {};
    for (const l of state.lineup ?? []) asMap[l.slot] = l.idx;
    return (
      <DraftLineup
        runId={state.run_id}
        picks={state.picks}
        initialFormation={state.formation}
        initialLineup={state.lineup ? asMap : null}
        onReady={() => {
          setShowLineup(false);
          router.refresh();
        }}
      />
    );
  }

  // ── ELIGIENDO JUGADORES ──
  if (state.status === "drafting") {
    const pct = Math.round((state.slot_index / state.total) * 100);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">
              Elegí tu {state.position}
            </span>
            <span className="text-xs text-muted">
              {state.slot_index + 1} de {state.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-turf transition-[opacity,transform]"
              style={{ transform: `scaleX(${(pct) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
            />
          </div>
        </div>

        {error && (
          <Notice tone="error">{error}</Notice>
        )}

        <div className="space-y-2">
          {(state.candidates ?? []).map((c, i) => (
            <CandidateRow
              key={c.template_id + i}
              c={c}
              disabled={pending}
              busy={busy === `pick${i}`}
              onPick={() => choose(i)}
            />
          ))}
        </div>

        {state.picks.length > 0 && (
          <div>
            <p className="eyebrow mb-2 px-1">
              Tu equipo ({state.picks.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {state.picks.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  <b className="font-display">{p.overall}</b>
                  <span className="text-muted">{p.slot_pos}</span>
                  <span className="max-w-24 truncate">{p.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setBusy("abandon");
            start(async () => {
              await abandonDraft(state.run_id);
              setBusy(null);
              router.refresh();
            });
          }}
          className="w-full py-2 text-xs text-muted hover:text-danger"
        >
          Abandonar draft (sin devolución)
        </button>
      </div>
    );
  }

  // ── JUGANDO LA RACHA ──
  const avg = Math.round(
    state.picks.reduce((s, p) => s + p.overall, 0) /
      Math.max(1, state.picks.length)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-turf/40 bg-turf-soft/15 p-4 text-center">
        <p className="eyebrow text-turf">Racha del draft</p>
        <p className="font-display text-4xl font-extrabold">
          {state.wins}
          <span className="text-xl text-muted">/5</span>
        </p>
        <div className="mt-3 flex justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-8 rounded-full",
                i < state.wins ? "bg-turf" : "bg-surface-2"
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Media del equipo: <b className="text-text">{avg}</b>
        </p>
      </div>

      {lastMatch && (
        <div
          className={cn(
            "animate-fade-up rounded-2xl border p-4 text-center",
            lastMatch.won
              ? "border-turf/50 bg-turf-soft/25"
              : "border-danger/50 bg-danger/10"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            {lastMatch.won ? (
              <Check size={20} className="text-turf" />
            ) : (
              <X size={20} className="text-danger" />
            )}
            <span className="font-display text-2xl font-extrabold">
              {lastMatch.home} - {lastMatch.away}
            </span>
          </div>
          <p
            className={cn(
              "mt-1 text-sm font-bold",
              lastMatch.won ? "text-turf" : "text-danger"
            )}
          >
            {lastMatch.won ? "¡Victoria!" : "Derrota. Se termina el draft."}
          </p>
          {lastMatch.finished && lastMatch.reward && (
            <div className="mt-3 space-y-1 rounded-xl border border-trophy/40 bg-trophy-soft/30 p-3">
              <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-trophy">
                <Trophy size={15} /> Recompensa
              </p>
              <p className="font-display text-xl font-extrabold text-trophy">
                {lastMatch.reward.coins.toLocaleString("es")} monedas
              </p>
              {lastMatch.reward.packs.length > 0 && (
                <p className="text-xs text-muted">
                  + {lastMatch.reward.packs.map((p) => PACK_LABEL[p] ?? p).join(" + ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <Notice tone="error">{error}</Notice>
      )}

      {lastMatch?.finished ? (
        <Button fullWidth size="lg" onClick={() => router.refresh()}>
          Volver al draft
        </Button>
      ) : (
        <div className="space-y-2">
          <Button
            fullWidth
            size="lg"
            disabled={pending}
            onClick={playMatch}
          >
            <Swords size={17} />
            {busy === "match"
              ? "Jugando…"
              : `Jugar partido ${state.wins + 1}`}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            disabled={pending}
            onClick={() => setShowLineup(true)}
          >
            <Users size={16} /> Acomodar el equipo
          </Button>
        </div>
      )}

      <div>
        <p className="eyebrow mb-2 px-1">Tu once</p>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {state.picks.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 last:border-0"
            >
              <span className="w-8 shrink-0 text-center text-[11px] font-bold text-muted">
                {p.slot_pos}
              </span>
              <span className="font-display w-7 shrink-0 text-center text-base font-extrabold">
                {p.overall}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <Flag nation={p.nationality} size={12} />
              <ClubCrest club={p.club_name} size={14} showFallback={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  c,
  onPick,
  disabled,
  busy,
}: {
  c: DraftCandidate;
  onPick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2.5 text-left transition hover:border-turf active:scale-[0.99] disabled:opacity-50"
    >
      <Portrait name={c.name} size={42} className="shrink-0  bg-bg" />
      <span className="font-display w-9 shrink-0 text-center text-2xl font-extrabold">
        {c.overall}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-bold">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", RARITY_DOT[c.rarity])}
          />
          {c.name}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          <Flag nation={c.nationality} size={12} />
          <ClubCrest club={c.club_name} size={11} showFallback={false} />
          <span className="truncate">{c.club_name ?? "—"}</span>
        </span>
        <span className="text-[10px] text-muted">
          {RARITY_LABEL[c.rarity]}
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-turf">
        {busy ? "…" : "Elegir"}
      </span>
    </button>
  );
}
