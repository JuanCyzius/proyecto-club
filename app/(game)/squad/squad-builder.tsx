"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Flag } from "@/components/ui/flag";
import { Portrait } from "@/components/player-card/portrait";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FORMATIONS,
  FORMATION_NAMES,
  BENCH_SLOTS,
  TACTIC_OPTIONS,
  type Tactics,
  type FormationSlot,
} from "@/lib/formations";
import {
  positionFit,
  type Fit,
  type OwnedCard,
  type Position,
} from "@/lib/players";
import { teamRating } from "@/lib/team-rating";
import {
  teamChemistry,
  playerChemistry,
  chemTier,
  type ChemPlayer,
} from "@/lib/chemistry";
import { shortLeague } from "@/lib/flags";
import { shortName } from "@/lib/format";
import { ClubCrest } from "@/components/club/club-crest";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { saveSquad } from "./actions";

// Resplandor según la rareza del jugador: se reconoce el nivel de la
// carta de un vistazo, sin leer nada.
const RARITY_AURA: Record<string, { ring: string; glow: string }> = {
  common:    { ring: "#8A5A2B", glow: "rgba(138,90,43,0.55)" },
  uncommon:  { ring: "#AAB7C2", glow: "rgba(170,183,194,0.5)" },
  rare:      { ring: "#ECC65E", glow: "rgba(236,198,94,0.55)" },
  epic:      { ring: "#6F86FF", glow: "rgba(111,134,255,0.6)" },
  legendary: { ring: "#FF5B6E", glow: "rgba(255,91,110,0.6)" },
  icon:      { ring: "#F6E7B3", glow: "rgba(246,231,179,0.7)" },
};

const FIT_RING: Record<Fit, string> = {
  exact: "ring-turf text-turf",
  compatible: "ring-trophy text-trophy",
  group: "ring-muted text-muted",
  none: "ring-danger text-danger",
};
const FIT_RANK: Record<Fit, number> = { exact: 0, compatible: 1, group: 2, none: 3 };

export function SquadBuilder({
  cards,
  initialFormation,
  initialTactics,
  initialSlots,
}: {
  cards: OwnedCard[];
  initialFormation: string;
  initialTactics: Tactics;
  initialSlots: Record<string, string>;
}) {
  const [formation, setFormation] = useState(initialFormation);
  const [tactics, setTactics] = useState<Tactics>(initialTactics);
  const [slots, setSlots] = useState<Record<string, string>>(initialSlots);
  const [picker, setPicker] = useState<{ slot: string; pos?: Position } | null>(
    null
  );
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cardById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );
  const starterSlots = FORMATIONS[formation];

  const assignedElsewhere = (exceptSlot: string) => {
    const s = new Set<string>();
    for (const [slot, id] of Object.entries(slots)) {
      if (slot !== exceptSlot && id) s.add(id);
    }
    return s;
  };

  // Métricas en vivo (se re-validan en el servidor al simular, Fase 4).
  // Todo lo derivado se calcula una sola vez por cambio real de plantilla.
  // La química es O(n²), así que sin esto se recalcularía al escribir
  // en el buscador o al abrir un panel.
  const { starters, rating, chemSquad, chem, chemBySlot, reserveCards } =
    useMemo(() => {
      const st = starterSlots
        .map((s) => {
          const id = slots[s.code];
          const c = id ? cardById.get(id) : undefined;
          return c ? { c, slot: s } : null;
        })
        .filter(Boolean) as { c: OwnedCard; slot: FormationSlot }[];

      const rt = teamRating(
        st.map(({ c, slot }) => ({
          overall: c.overall,
          cardPos: c.position,
          slotPos: slot.pos,
        }))
      );

      // Química con vínculos reales (club / liga / nación)
      const squad: ChemPlayer[] = st.map(({ c, slot }) => ({
        cardPos: c.position,
        slotPos: slot.pos,
        club: c.clubName,
        league: c.leagueName,
        nation: c.nationality,
      }));
      const total = teamChemistry(squad);
      const bySlot = new Map<string, number>();
      st.forEach(({ slot }, i) => {
        bySlot.set(slot.code, playerChemistry(squad[i], squad).total);
      });

      const benchIds = BENCH_SLOTS.map((b) => slots[b]).filter(
        Boolean
      ) as string[];
      const assigned = new Set<string>([
        ...(starterSlots.map((s) => slots[s.code]).filter(Boolean) as string[]),
        ...benchIds,
      ]);

      return {
        starters: st,
        rating: rt,
        chemSquad: squad,
        chem: total,
        chemBySlot: bySlot,
        reserveCards: cards.filter((c) => !assigned.has(c.id)),
      };
    }, [starterSlots, slots, cardById, cards]);

  const filledCount = starters.length;

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function assign(slot: string, cardId: string | null) {
    setSlots((prev) => {
      const next = { ...prev };
      if (cardId) next[slot] = cardId;
      else delete next[slot];
      return next;
    });
    markDirty();
    setPicker(null);
  }

  function changeFormation(next: string) {
    // Reubica los titulares actuales en la nueva formación por mejor ajuste.
    const pool = starterSlots
      .map((s) => slots[s.code])
      .filter(Boolean) as string[];
    const newSlots: Record<string, string> = {};
    // conservar banca
    for (const b of BENCH_SLOTS) if (slots[b]) newSlots[b] = slots[b];

    const remaining = [...pool];
    for (const s of FORMATIONS[next]) {
      let bestIdx = -1;
      let bestRank = 99;
      let bestOvr = -1;
      remaining.forEach((id, i) => {
        const c = cardById.get(id);
        if (!c) return;
        const rank = FIT_RANK[positionFit(c.position, s.pos)];
        if (rank < bestRank || (rank === bestRank && c.overall > bestOvr)) {
          bestRank = rank;
          bestOvr = c.overall;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0) {
        newSlots[s.code] = remaining[bestIdx];
        remaining.splice(bestIdx, 1);
      }
    }
    setFormation(next);
    setSlots(newSlots);
    markDirty();
  }

  function setTactic<K extends keyof Tactics>(k: K, v: Tactics[K]) {
    setTactics((prev) => ({ ...prev, [k]: v }));
    markDirty();
  }

  const onSave = useCallback(() => {
    setError(null);
    start(async () => {
      const res = await saveSquad(formation, tactics, slots);
      if (res.ok) {
        setDirty(false);
        setSaved(true);
      } else {
        setError(res.error ?? "No se pudo guardar.");
      }
    });
  }, [formation, tactics, slots]);

  /**
   * Guardado automático. Espera 800 ms tras el último cambio para no
   * escribir en cada toque: si movés tres jugadores seguidos, se guarda
   * una sola vez. El botón manual sigue existiendo por si falló algo.
   */
  const autosave = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!dirty) return;
    clearTimeout(autosave.current);
    autosave.current = setTimeout(() => onSave(), 800);
    return () => clearTimeout(autosave.current);
  }, [dirty, onSave]);

  // Candidatos para el picker actual.
  const pickerCandidates = useMemo(() => {
    if (!picker) return [];
    const taken = assignedElsewhere(picker.slot);
    const list = cards.filter((c) => !taken.has(c.id));
    if (picker.pos) {
      const pos = picker.pos;
      return [...list].sort((a, b) => {
        const ra = FIT_RANK[positionFit(a.position, pos)];
        const rb = FIT_RANK[positionFit(b.position, pos)];
        return ra - rb || b.overall - a.overall;
      });
    }
    return [...list].sort((a, b) => b.overall - a.overall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, cards, slots]);

  return (
    <div className="space-y-4 pb-24">
      {/* Métricas + formación */}
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Media" value={rating || "—"} accent="turf" />
        <Metric
          label="Química"
          value={`${chem}`}
          accent="trophy"
          suffix="/100"
        />
        <Metric label="Titulares" value={`${filledCount}/11`} accent="muted" />
      </div>

      {/* Barra de química con explicación */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-muted">Química del equipo</span>
          <span className={cn("font-bold", chemTier(chem / 10).color)}>
            {chemTier(chem / 10).label}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              "h-full rounded-full",
              chem >= 85
                ? "bg-turf"
                : chem >= 65
                  ? "bg-turf/70"
                  : chem >= 40
                    ? "bg-trophy"
                    : "bg-danger"
            )}
            style={{ transform: `scaleX(${(chem) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Sube juntando jugadores del{" "}
          <b className="text-text">mismo club</b>, la{" "}
          <b className="text-text">misma liga</b> o la{" "}
          <b className="text-text">misma nacionalidad</b>, y colocándolos en su
          posición natural.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Formación</span>
        <select
          value={formation}
          onChange={(e) => changeFormation(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold focus:border-turf focus:outline-none"
        >
          {FORMATION_NAMES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {/* Campo */}
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border"
        style={{ containerType: "inline-size" }}
      >
        <Pitch />
        {starterSlots.map((s) => {
          const id = slots[s.code];
          const c = id ? cardById.get(id) : undefined;
          const fit = c ? positionFit(c.position, s.pos) : null;
          return (
            <button
              key={s.code}
              onClick={() => setPicker({ slot: s.code, pos: s.pos })}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              {c ? (
                <PitchPlayer
                  card={c}
                  slotPos={s.pos}
                  chem={chemBySlot.get(s.code) ?? 0}
                />
              ) : (
                <div className="flex h-11 w-11 flex-col items-center justify-center rounded-full border border-dashed border-white/40 bg-black/20 text-white/70 transition hover:border-turf hover:bg-turf-soft/30">
                  <span className="text-[10px] font-bold">{s.pos}</span>
                  <span className="text-sm leading-none">+</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detalle del once: todo legible en lista */}
      {starters.length > 0 && (
        <div>
          <p className="eyebrow mb-2 px-1">Once titular</p>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {starters.map(({ c, slot }) => {
              const fit = positionFit(c.position, slot.pos);
              const ch = chemBySlot.get(slot.code) ?? 0;
              const st = typeof c.stamina === "number" ? c.stamina : 100;
              return (
                <button
                  key={slot.code}
                  onClick={() => setPicker({ slot: slot.code, pos: slot.pos })}
                  className="flex w-full items-center gap-2 border-b border-border/60 px-2.5 py-2 text-left last:border-0 hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "w-9 shrink-0 text-center text-[11px] font-bold",
                      FIT_RING[fit].split(" ")[1]
                    )}
                  >
                    {slot.pos}
                  </span>
                  <Portrait name={c.name} size={26} className="shrink-0  bg-bg" />
                  <span className="font-display w-7 shrink-0 text-center text-base font-extrabold">
                    {c.overall}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {c.name}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted">
                      <Flag nation={c.nationality} size={12} />
                      <ClubCrest club={c.clubName} size={11} showFallback={false} />
                      <span className="truncate">{c.clubName ?? "—"}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block text-[11px] font-bold tabular-nums",
                        chemTier(ch).color
                      )}
                    >
                      {ch.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-muted">química</span>
                  </span>
                  <span className="w-9 shrink-0 text-right">
                    <span
                      className={cn(
                        "block text-[11px] font-bold tabular-nums",
                        st >= 85 ? "text-turf" : st >= 65 ? "text-trophy" : "text-danger"
                      )}
                    >
                      {Math.round(st)}%
                    </span>
                    <span className="text-[9px] text-muted">energía</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Banca */}
      <div>
        <p className="eyebrow mb-2 px-1">Suplentes</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {BENCH_SLOTS.map((b) => {
            const id = slots[b];
            const c = id ? cardById.get(id) : undefined;
            return (
              <button
                key={b}
                onClick={() => setPicker({ slot: b })}
                className={cn(
                  "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg border text-center",
                  c
                    ? "border-border bg-surface"
                    : "border-dashed border-border bg-surface/50 text-muted"
                )}
              >
                {c ? (
                  <>
                    <span className="font-display text-sm font-extrabold">
                      {c.overall}
                    </span>
                    <span className="text-[9px] font-bold text-muted">
                      {c.position}
                    </span>
                    <span className="max-w-[52px] truncate text-[9px] text-muted">
                      {shortName(c.name)}
                    </span>
                  </>
                ) : (
                  <span className="text-lg">+</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reservas */}
      {reserveCards.length > 0 && (
        <div>
          <p className="eyebrow mb-2 px-1">
            Reserva ({reserveCards.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {reserveCards.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              >
                <b className="font-display">{c.overall}</b>
                <span className="text-muted">{c.position}</span>
                <Flag nation={c.nationality} size={12} />
                <span className="text-text/80">{shortName(c.name)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Táctica */}
      <div>
        <p className="eyebrow mb-2 px-1">Táctica</p>
        <div className="space-y-2">
          {(Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]).map((k) => (
            <div
              key={k}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2"
            >
              <span className="w-24 shrink-0 pl-1 text-sm text-muted">
                {TACTIC_OPTIONS[k].label}
              </span>
              <div className="flex flex-1 gap-1">
                {TACTIC_OPTIONS[k].options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setTactic(k, o.value as Tactics[typeof k])}
                    className={cn(
                      "flex-1 rounded-lg px-1 py-1.5 text-xs font-semibold transition",
                      tactics[k] === o.value
                        ? "bg-turf text-turf-ink"
                        : "text-muted hover:text-text"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de guardado */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="app-shell flex items-center gap-3 py-2.5">
          <p className="flex-1 text-xs text-muted">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : saved ? (
              <span className="inline-flex items-center gap-1 text-turf">
                <Check size={14} /> Plantilla guardada
              </span>
            ) : pending || dirty ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-trophy" />
                Guardando…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted">
                <Check size={13} /> Todo al día
              </span>
            )}
          </p>
          {/* El guardado es automático; el botón queda solo por si falla */}
          {error && (
            <Button size="sm" variant="secondary" onClick={onSave} disabled={pending}>
              Reintentar
            </Button>
          )}
        </div>
      </div>

      {/* Picker */}
      <Modal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker?.pos ? `Elegir ${picker.pos}` : "Elegir suplente"}
      >
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {picker && slots[picker.slot] && (
            <button
              onClick={() => assign(picker.slot, null)}
              className="flex w-full items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              <X size={16} /> Quitar de esta posición
            </button>
          )}
          {pickerCandidates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No hay cartas disponibles.
            </p>
          )}
          {pickerCandidates.map((c) => {
            const fit = picker?.pos
              ? positionFit(c.position, picker.pos)
              : null;
            // Química que tendría en ese hueco con el once actual
            const preview = picker?.pos
              ? playerChemistry(
                  {
                    cardPos: c.position,
                    slotPos: picker.pos,
                    club: c.clubName,
                    league: c.leagueName,
                    nation: c.nationality,
                  },
                  chemSquad
                ).total
              : null;
            return (
              <button
                key={c.id}
                onClick={() => assign(picker!.slot, c.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition hover:border-turf/50"
              >
                <Portrait name={c.name} size={32} className="shrink-0  bg-bg" />
                <span className="font-display w-7 shrink-0 text-center text-lg font-extrabold">
                  {c.overall}
                </span>
                <span
                  className={cn(
                    "w-8 shrink-0 text-center text-xs font-bold",
                    fit ? FIT_RING[fit].split(" ")[1] : "text-muted"
                  )}
                >
                  {c.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    <Flag nation={c.nationality} size={12} /> {c.name}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[10px] text-muted">
                    <ClubCrest club={c.clubName} size={12} showFallback={false} />
                    <span className="truncate">
                      {c.clubName ?? "—"} · {shortLeague(c.leagueName)}
                    </span>
                  </span>
                </span>
                {preview != null && (
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                      chemTier(preview).color
                    )}
                  >
                    {preview.toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  suffix,
}: {
  label: string;
  value: string | number;
  accent: "turf" | "trophy" | "muted";
  suffix?: string;
}) {
  const color =
    accent === "turf"
      ? "text-turf"
      : accent === "trophy"
        ? "text-trophy"
        : "text-text";
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-center shadow-e2">
      <p className={cn("text-2xl font-extrabold tabular-nums", color)}>
        {value}
        {suffix && (
          <span className="text-xs font-semibold text-muted">{suffix}</span>
        )}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Pitch() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#0f2a1c] to-[#0a1f14]">
      <svg
        viewBox="0 0 100 133"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ opacity: 0.5 }}
      >
        <g fill="none" stroke="#2FE08A" strokeOpacity="0.25" strokeWidth="0.4">
          <rect x="3" y="3" width="94" height="127" />
          <line x1="3" y1="66.5" x2="97" y2="66.5" />
          <circle cx="50" cy="66.5" r="12" />
          <rect x="28" y="3" width="44" height="16" />
          <rect x="28" y="114" width="44" height="16" />
        </g>
      </svg>
    </div>
  );
}


/** Ficha del jugador en el campo: rostro, media, nombre, club, país,
 *  química y estamina con su valor numérico. */
function PitchPlayer({
  card,
  slotPos,
  chem,
}: {
  card: OwnedCard;
  slotPos: Position;
  chem: number;
}) {
  const fit = positionFit(card.position, slotPos);
  const tier = chemTier(chem);
  const chemDots = Math.round(chem / 2); // 0-5
  const stamina = typeof card.stamina === "number" ? card.stamina : 100;
  const aura = RARITY_AURA[card.rarity] ?? RARITY_AURA.common;

  // Todo se dimensiona en % del ancho del campo (cqw): las fichas crecen
  // en pantallas grandes sin solaparse en las chicas. El hueco más
  // ajustado de la formación es del 24%, así que la ficha ocupa 21%.
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: "17.5cqw", maxWidth: "98px" }}
    >
      {/* Rostro con aura del color de la rareza */}
      <div
        className="relative rounded-full bg-bg/90 backdrop-blur"
        style={{
          width: "11.8cqw",
          height: "11.8cqw",
          maxWidth: "64px",
          maxHeight: "64px",
          boxShadow: `0 0 0 2px ${aura.ring}, 0 0 10px 2px ${aura.glow}`,
        }}
      >
        <Portrait name={card.name} className="h-full w-full rounded-full" />
        {/* Media */}
        <span
          className="absolute -left-[0.4em] -top-[0.3em] rounded-md bg-bg px-[0.35em] font-display font-extrabold leading-tight text-text ring-1 ring-border"
          style={{ fontSize: "4cqw" }}
        >
          {card.overall}
        </span>
        {/* Aviso de jugador fuera de su puesto */}
        {fit === "none" && (
          <span
            className="absolute -right-[0.25em] -top-[0.25em] flex items-center justify-center rounded-full bg-danger text-bg ring-2 ring-bg"
            style={{ width: "3.6cqw", height: "3.6cqw", fontSize: "2.4cqw" }}
            title="Fuera de posición"
          >
            !
          </span>
        )}

        {/* Bandera, anclada al borde del rostro */}
        <Flag
          nation={card.nationality}
          className="absolute -bottom-[0.15em] -right-[0.35em] ring-1 ring-bg"
          style={{ width: "4.2cqw", height: "4.2cqw", minWidth: 13, minHeight: 13 }}
        />
      </div>

      {/* Nombre y escudo, juntos y legibles */}
      <span
        className="mt-[0.35em] flex w-full items-center justify-center gap-[0.25em] rounded bg-bg/85 px-[0.3em] py-[0.1em] backdrop-blur"
        style={{ fontSize: "3.5cqw" }}
      >
        <ClubCrest
          club={card.clubName}
          size={13}
          showFallback={false}
          className="shrink-0"
          style={{ width: "3.6cqw", height: "3.6cqw", minWidth: 11, minHeight: 11 }}
        />
        <span className="truncate font-bold leading-tight text-text">
          {shortName(card.name)}
        </span>
      </span>

      {/* Posición, química y energía en una sola fila */}
      <span
        className="mt-[0.2em] flex items-center gap-[0.35em] rounded bg-bg/75 px-[0.35em] backdrop-blur"
        style={{ fontSize: "3.2cqw" }}
      >
        <span className={cn("font-bold", FIT_RING[fit].split(" ")[1])}>
          {slotPos}
        </span>
        <span className="flex gap-[1px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "rounded-full",
                i < chemDots ? tier.ring.replace("ring-", "bg-") : "bg-white/25"
              )}
              style={{ width: "0.9cqw", height: "0.9cqw", minWidth: 3, minHeight: 3 }}
            />
          ))}
        </span>
        <span
          className={cn(
            "font-bold tabular-nums",
            stamina >= 85 ? "text-turf" : stamina >= 65 ? "text-trophy" : "text-danger"
          )}
        >
          {Math.round(stamina)}
        </span>
      </span>

    </div>
  );
}
