"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Shuffle, Swords, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { Flag } from "@/components/ui/flag";
import { ClubCrest } from "@/components/club/club-crest";
import { Portrait } from "@/components/player-card/portrait";
import { FORMATIONS } from "@/lib/formations";
import { playerChemistry, teamChemistry, type ChemPlayer } from "@/lib/chemistry";
import { positionFit, type Position } from "@/lib/players";
import { shortLeague } from "@/lib/flags";
import { setDraftLineup } from "./actions";
import type { DraftPick } from "./types";

const FORMATION_LIST = Object.keys(FORMATIONS);

/** Puntos de química por jugador, para pintar el estado del once. */
function chemDots(n: number) {
  if (n >= 9) return "bg-turf";
  if (n >= 6) return "bg-trophy";
  if (n >= 3) return "bg-orange-400";
  return "bg-danger";
}

/**
 * Armado del equipo del draft, al estilo FUT: elegís formación y
 * movés jugadores entre el once y el banco antes de jugar. La
 * química se recalcula en vivo, así ves cuánto mejora cada cambio.
 */
export function DraftLineup({
  runId,
  picks,
  initialFormation,
  initialLineup,
  onReady,
}: {
  runId: string;
  picks: DraftPick[];
  initialFormation: string;
  initialLineup: Record<string, number> | null;
  onReady: () => void;
}) {
  const [formation, setFormation] = useState(
    FORMATIONS[initialFormation] ? initialFormation : "4-3-3"
  );
  const slots = FORMATIONS[formation];

  // Alineación: código de hueco → índice dentro de picks
  const [lineup, setLineup] = useState<Record<string, number>>(() => {
    if (initialLineup && Object.keys(initialLineup).length >= 11) {
      return { ...initialLineup };
    }
    // Por defecto: cada elección va al hueco con el que fue sorteada
    const base: Record<string, number> = {};
    picks.forEach((p, i) => {
      base[p.slot] = i;
    });
    return base;
  });

  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const benchCodes = useMemo(
    () =>
      Object.keys(lineup)
        .filter((c) => c.startsWith("SUB"))
        .sort(),
    [lineup]
  );

  const starters = useMemo(
    () =>
      slots
        .map((s) => ({ slot: s, pick: picks[lineup[s.code]] }))
        .filter((x) => x.pick),
    [slots, picks, lineup]
  );

  // Química del once tal como está armado ahora
  const { chem, perSlot } = useMemo(() => {
    const squad: ChemPlayer[] = starters.map(({ slot, pick }) => ({
      cardPos: pick.position,
      slotPos: slot.pos as Position,
      club: pick.club_name,
      league: pick.league_name,
      nation: pick.nationality,
    }));
    const map = new Map<string, number>();
    starters.forEach(({ slot }, i) => {
      if (squad[i]) map.set(slot.code, playerChemistry(squad[i], squad).total);
    });
    return {
      chem: squad.length === 11 ? teamChemistry(squad) : 0,
      perSlot: map,
    };
  }, [starters]);

  const avg =
    starters.length > 0
      ? Math.round(
          starters.reduce((s, x) => s + x.pick.overall, 0) / starters.length
        )
      : 0;

  /** Intercambia dos huecos (once ↔ once, once ↔ banco). */
  function tapSlot(code: string) {
    setError(null);
    if (swapFrom === null) {
      setSwapFrom(code);
      return;
    }
    if (swapFrom === code) {
      setSwapFrom(null);
      return;
    }
    setLineup((prev) => {
      const next = { ...prev };
      const a = next[swapFrom];
      const b = next[code];
      if (a === undefined && b === undefined) return prev;
      if (b === undefined) delete next[swapFrom];
      else next[swapFrom] = b;
      if (a === undefined) delete next[code];
      else next[code] = a;
      return next;
    });
    setSwapFrom(null);
  }

  /** Al cambiar de formación, los titulares se reubican en orden. */
  function changeFormation(next: string) {
    const nextSlots = FORMATIONS[next];
    if (!nextSlots) return;
    setSwapFrom(null);
    setLineup((prev) => {
      const current = slots
        .map((s) => prev[s.code])
        .filter((v) => v !== undefined) as number[];
      const out: Record<string, number> = {};
      nextSlots.forEach((s, i) => {
        if (current[i] !== undefined) out[s.code] = current[i];
      });
      for (const code of Object.keys(prev)) {
        if (code.startsWith("SUB")) out[code] = prev[code];
      }
      return out;
    });
    setFormation(next);
  }

  function confirm() {
    setError(null);
    const missing = slots.filter((s) => lineup[s.code] === undefined);
    if (missing.length > 0) {
      setError(`Faltan titulares: ${missing.map((s) => s.code).join(", ")}`);
      return;
    }
    // El servidor espera la lista completa: cada hueco con el índice
    // del jugador y la posición que ocupa.
    const payload = [
      ...slots.map((sl) => ({
        idx: lineup[sl.code],
        slot: sl.code,
        slot_pos: sl.pos as string,
      })),
      ...benchCodes.map((code) => ({
        idx: lineup[code],
        slot: code,
        slot_pos: picks[lineup[code]]?.position ?? "CM",
      })),
    ].filter((x) => x.idx !== undefined);

    start(async () => {
      const res = await setDraftLineup(runId, formation, payload);
      if (res.ok) onReady();
      else setError(res.error ?? "No se pudo guardar la alineación.");
    });
  }

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span className="text-center">
          <span className="block font-display text-2xl font-extrabold">{avg}</span>
          <span className="eyebrow">media</span>
        </span>
        <span className="text-center">
          <span
            className={cn(
              "block font-display text-2xl font-extrabold",
              chem >= 75 ? "text-turf" : chem >= 45 ? "text-trophy" : "text-danger"
            )}
          >
            {chem}
          </span>
          <span className="eyebrow">química</span>
        </span>
        <span className="flex-1 text-right text-[11px] text-muted">
          Tocá dos jugadores para intercambiarlos
        </span>
      </div>

      {/* Formación */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FORMATION_LIST.map((f) => (
          <button
            key={f}
            onClick={() => changeFormation(f)}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold",
              formation === f
                ? "border-turf bg-turf-soft/30 text-turf"
                : "border-border text-muted"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* Cancha */}
      <div
        className="relative aspect-[5/7] w-full overflow-hidden rounded-2xl border border-border bg-turf-soft/10"
        style={{ containerType: "inline-size" }}
      >
        <div className="absolute inset-3 rounded-xl border border-turf/20" />
        {slots.map((s) => {
          const pick = picks[lineup[s.code]];
          const selected = swapFrom === s.code;
          const fit = pick ? positionFit(pick.position, s.pos as Position) : null;
          return (
            <button
              key={s.code}
              onClick={() => tapSlot(s.code)}
              style={{
                left: `${Math.min(90, Math.max(10, s.x))}%`,
                top: `${Math.min(90, Math.max(10, s.y))}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              <span
                className={cn(
                  "flex w-[17cqw] max-w-[92px] flex-col items-center rounded-lg border bg-bg/90 px-1 py-1 backdrop-blur",
                  selected
                    ? "border-trophy ring-2 ring-trophy"
                    : pick
                      ? "border-border"
                      : "border-dashed border-muted"
                )}
              >
                {pick ? (
                  <>
                    <span className="flex items-center gap-0.5">
                      <span className="font-display text-[3.4cqw] font-extrabold">
                        {pick.overall}
                      </span>
                      <span
                        className={cn(
                          "text-[2.2cqw] font-bold",
                          fit === "exact"
                            ? "text-turf"
                            : fit === "none"
                              ? "text-danger"
                              : "text-trophy"
                        )}
                      >
                        {s.pos}
                      </span>
                    </span>
                    <Portrait
                      name={pick.name}
                      className="rounded-full"
                      style={{ width: "5.4cqw", height: "5.4cqw", minWidth: 18, minHeight: 18 }}
                    />
                    <span className="w-full truncate text-center text-[2.4cqw] font-bold">
                      {pick.name.split(" ").slice(-1)[0]}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Flag nation={pick.nationality} size={9} />
                      <ClubCrest club={pick.club_name} size={9} showFallback={false} />
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          chemDots(perSlot.get(s.code) ?? 0)
                        )}
                      />
                    </span>
                  </>
                ) : (
                  <span className="py-2 text-[3cqw] text-muted">{s.pos}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Banco */}
      <div>
        <p className="eyebrow mb-1.5">Suplentes ({benchCodes.length})</p>
        <div className="grid grid-cols-4 gap-1.5">
          {benchCodes.map((code) => {
            const pick = picks[lineup[code]];
            const selected = swapFrom === code;
            return (
              <button
                key={code}
                onClick={() => tapSlot(code)}
                className={cn(
                  "flex flex-col items-center rounded-lg border bg-surface px-1 py-1.5",
                  selected ? "border-trophy ring-2 ring-trophy" : "border-border"
                )}
              >
                {pick ? (
                  <>
                    <span className="font-display text-sm font-extrabold">
                      {pick.overall}
                    </span>
                    <span className="text-[9px] font-bold text-muted">
                      {pick.position}
                    </span>
                    <span className="w-full truncate text-center text-[9px]">
                      {pick.name.split(" ").slice(-1)[0]}
                    </span>
                    <span className="truncate text-[8px] text-muted">
                      {shortLeague(pick.league_name)}
                    </span>
                  </>
                ) : (
                  <span className="py-3 text-[10px] text-muted">—</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {swapFrom && (
        <button
          onClick={() => setSwapFrom(null)}
          className="mx-auto flex items-center gap-1 text-xs text-muted underline"
        >
          <X size={12} /> Cancelar el cambio
        </button>
      )}

      <Button fullWidth size="lg" disabled={pending} onClick={confirm}>
        {pending ? (
          "Guardando…"
        ) : (
          <>
            <Swords size={17} /> Confirmar equipo y jugar
          </>
        )}
      </Button>
      <p className="text-center text-[10px] text-muted">
        Podés volver a acomodar el equipo antes de cada partido.
      </p>
    </div>
  );
}
