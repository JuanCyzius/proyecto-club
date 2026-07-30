"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * El arco, dividido en 8 zonas (2 filas × 4 columnas).
 *
 *   0 1 2 3   ← arriba
 *   4 5 6 7   ← abajo
 *
 * Sirve para tres cosas: elegir dónde patear, elegir dónde tirarse como
 * arquero, y ver la jugada animada cuando se resuelve el duelo.
 */

export const ZONE_LABELS = [
  "Ángulo izquierdo",
  "Alto izquierda",
  "Alto derecha",
  "Ángulo derecho",
  "Abajo izquierda",
  "Raso izquierda",
  "Raso derecha",
  "Abajo derecha",
];

/** Zonas que cubre el arquero: la elegida y las contiguas, en círculo. */
export function coveredZones(dive: number, zones: number): number[] {
  return Array.from({ length: zones }, (_, i) => (dive + i) % 8);
}

type Mode = "pick" | "reveal";

export function GoalGrid({
  mode = "pick",
  selected,
  onSelect,
  covered,
  shot,
  keeperAt,
  isGoal,
  disabled,
  label,
}: {
  mode?: Mode;
  /** Zona elegida (al patear o al atajar). */
  selected?: number | null;
  onSelect?: (zone: number) => void;
  /** Zonas cubiertas por el arquero, para previsualizar o revelar. */
  covered?: number[];
  /** Zona del disparo (solo en revelado). */
  shot?: number | null;
  /** Zona base del arquero (solo en revelado). */
  keeperAt?: number | null;
  isGoal?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [ballIn, setBallIn] = useState(false);

  useEffect(() => {
    if (mode !== "reveal" || shot == null) return;
    setBallIn(false);
    const t = setTimeout(() => setBallIn(true), 60);
    return () => clearTimeout(t);
  }, [mode, shot]);

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-center text-xs font-semibold text-muted">{label}</p>
      )}

      <div className="relative mx-auto w-full max-w-sm">
        {/* Marco del arco */}
        <div
          className="relative overflow-hidden rounded-t-lg border-x-[6px] border-t-[6px] border-white/85 bg-gradient-to-b from-turf-soft/25 to-bg/60"
          style={{ aspectRatio: "16 / 9" }}
        >
          {/* Red */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 14px), repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 14px)",
            }}
          />

          {/* Zonas */}
          <div className="relative grid h-full grid-cols-4 grid-rows-2">
            {Array.from({ length: 8 }).map((_, z) => {
              const isCovered = covered?.includes(z);
              const isSel = selected === z;
              const isShot = mode === "reveal" && shot === z;

              return (
                <button
                  key={z}
                  type="button"
                  disabled={disabled || mode === "reveal"}
                  onClick={() => onSelect?.(z)}
                  aria-label={ZONE_LABELS[z]}
                  aria-pressed={isSel}
                  className={cn(
                    "relative border border-white/10 transition-colors duration-150",
                    mode === "pick" && !disabled && "hover:bg-white/10",
                    isCovered && "bg-danger/25",
                    isSel && "bg-turf/35",
                    isShot && (isGoal ? "bg-turf/45" : "bg-danger/45")
                  )}
                >
                  {isCovered && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-danger/70">
                      ✕
                    </span>
                  )}
                  {isSel && mode === "pick" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-3 w-3 rounded-full bg-turf shadow-glow" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Arquero */}
          {mode === "reveal" && keeperAt != null && (
            <Keeper zone={keeperAt} />
          )}

          {/* Pelota */}
          {mode === "reveal" && shot != null && (
            <Ball zone={shot} arrived={ballIn} isGoal={!!isGoal} />
          )}
        </div>

        {/* Línea de gol */}
        <div className="h-1 rounded-b bg-white/85" />
      </div>
    </div>
  );
}

/** Posición central de una zona, en % del arco. */
function zoneCenter(z: number) {
  const col = z % 4;
  const row = Math.floor(z / 4);
  return { x: col * 25 + 12.5, y: row * 50 + 25 };
}

function Ball({
  zone,
  arrived,
  isGoal,
}: {
  zone: number;
  arrived: boolean;
  isGoal: boolean;
}) {
  const { x, y } = zoneCenter(zone);
  return (
    <span
      className="pointer-events-none absolute z-20 flex items-center justify-center rounded-full bg-white shadow-lg gpu"
      style={{
        width: "11%",
        aspectRatio: "1",
        left: arrived ? `${x}%` : "50%",
        top: arrived ? `${y}%` : "128%",
        transform: "translate(-50%, -50%)",
        transition:
          "left 520ms cubic-bezier(0.22,0.9,0.3,1), top 520ms cubic-bezier(0.22,0.9,0.3,1), opacity 200ms",
        opacity: arrived ? 1 : 0.9,
        boxShadow: arrived
          ? `0 0 14px 3px ${isGoal ? "rgba(47,224,138,.6)" : "rgba(242,85,90,.6)"}`
          : "0 2px 8px rgba(0,0,0,.5)",
      }}
    >
      <span className="text-[9px]">⚽</span>
    </span>
  );
}

function Keeper({ zone }: { zone: number }) {
  const { x, y } = zoneCenter(zone);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    setMoved(false);
    const t = setTimeout(() => setMoved(true), 40);
    return () => clearTimeout(t);
  }, [zone]);

  return (
    <span
      className="pointer-events-none absolute z-10 gpu"
      style={{
        left: moved ? `${x}%` : "50%",
        top: moved ? `${y}%` : "50%",
        transform: "translate(-50%, -50%)",
        transition: "left 380ms cubic-bezier(0.34,1.3,0.64,1), top 380ms cubic-bezier(0.34,1.3,0.64,1)",
      }}
    >
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden>
        {/* Silueta simple de arquero estirado */}
        <circle cx="20" cy="9" r="5.5" fill="#F5C451" />
        <path
          d="M20 15 L20 27 M20 18 L8 14 M20 18 L32 14 M20 27 L14 37 M20 27 L26 37"
          stroke="#F5C451"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
