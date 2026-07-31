"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Coins,
  Play,
  Pause,
  FastForward,
  Swords,
  Repeat,
  Zap,
  Shield,
  Gauge,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClubCrest } from "@/components/club/club-crest";
import { RewardBurst } from "@/components/ui/reward-burst";
import type { MatchEvent } from "@/lib/sim/types";
import type { Decision, PublicMatchView } from "@/lib/sim/live";
import { MENTALITY_LEVELS } from "@/lib/sim/live";
import {
  advanceMatch,
  changeMentality,
  decideMatch,
  subPlayer,
  type LiveResult,
} from "./live-actions";

type Props = {
  matchId: string;
  initialEvents: MatchEvent[];
  initialView: PublicMatchView;
  initialDecision: Decision | null;
  initialFinished: boolean;
  initialReward: number | null;
  /** Vuelve al listado de rivales sin recargar la página. */
  onExit?: () => void;
};

const TONE_STYLE: Record<string, string> = {
  risky: "border-danger/40 bg-danger/10 hover:border-danger",
  safe: "border-sky-400/40 bg-sky-400/10 hover:border-sky-400",
  neutral: "border-turf/40 bg-turf-soft/30 hover:border-turf",
};

// Ritmo del reloj: 90 minutos en ~70 segundos de reloj real.
const MIN_PER_SEC = 90 / 70;

const TONE_ICON: Record<string, typeof Zap> = {
  risky: Zap,
  safe: Shield,
  neutral: Gauge,
};

const DECISION_SECONDS = 7;

export function LiveMatch({
  matchId,
  initialEvents,
  initialView,
  initialDecision,
  initialFinished,
  initialReward,
  onExit,
}: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [queue, setQueue] = useState<MatchEvent[]>(initialEvents);
  const [view, setView] = useState(initialView);
  const [decision, setDecision] = useState(initialDecision);
  const [finished, setFinished] = useState(initialFinished);
  const [reward, setReward] = useState(initialReward);
  const [playing, setPlaying] = useState(true);
  // Minuto mostrado: avanza de forma continua, con decimales internos.
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [mentality, setMentalityLocal] = useState(initialView.mentality ?? 2);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"goal" | "conceded" | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const autoAdvance = useRef(true);

  /**
   * Reloj continuo. En vez de saltar de evento en evento, el minuto
   * corre del 1 al 90 en tiempo real y los eventos se van revelando
   * cuando el reloj los alcanza. Si el servidor va más adelantado
   * (porque ya resolvió un tramo), el reloj acelera para no quedarse
   * atrás; nunca se adelanta a lo que el servidor confirmó.
   */
  useEffect(() => {
    if (!playing || finished) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(120, now - last) / 1000; // segundos, con techo
      last = now;

      setClock((prev) => {
        const target = view.minute;
        if (prev >= target) return prev; // esperando al servidor

        // Ritmo base: 90 minutos en ~70 segundos. Si el servidor está
        // lejos, se acelera de forma proporcional para alcanzarlo.
        const behind = target - prev;
        const speed = MIN_PER_SEC * (behind > 12 ? 3 : behind > 6 ? 1.9 : 1);
        return Math.min(target, prev + speed * dt);
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, finished, view.minute]);

  // Los eventos aparecen cuando el reloj llega a su minuto.
  useEffect(() => {
    if (queue.length === 0) return;
    const due = queue.filter((e) => e.minute <= clock + 0.01);
    if (due.length === 0) return;
    setEvents((prev) => [...prev, ...due]);
    setQueue((q) => q.slice(due.length));
    const goal = due.find((e) => e.type === "goal");
    if (goal) {
      setFlash(goal.side === "home" ? "goal" : "conceded");
      setTimeout(() => setFlash(null), 900);
    }
  }, [clock, queue]);

  // Auto-scroll del relato
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const handle = useCallback((res: LiveResult) => {
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setQueue((q) => [...q, ...res.events]);
    setView(res.view);
    if (typeof res.view.mentality === "number")
      setMentalityLocal(res.view.mentality);
    setDecision(res.decision);
    setFinished(res.finished);
    if (res.finished) setClock(90);
    if (res.reward != null) setReward(res.reward);
    setBusy(false);
  }, []);

  // Cuando se vacía la cola y no hay decisión, pedir el siguiente tramo
  useEffect(() => {
    if (
      queue.length > 0 ||
      decision ||
      finished ||
      busy ||
      !autoAdvance.current
    )
      return;
    setBusy(true);
    advanceMatch(matchId).then(handle);
  }, [queue.length, decision, finished, busy, matchId, handle]);

  function choose(optionId: string) {
    setBusy(true);
    setDecision(null);
    setShowSubs(false);
    decideMatch(matchId, optionId).then(handle);
  }

  function pickMentality(level: number) {
    setMentalityLocal(level); // respuesta inmediata
    changeMentality(matchId, level).then((res) => {
      if (res.ok) {
        setQueue((q) => [...q, ...res.events]);
        setView(res.view);
      }
    });
  }

  function doSub(outName: string, inName: string) {
    setBusy(true);
    subPlayer(matchId, outName, inName).then((res) => {
      handle(res);
      setShowSubs(false);
      if (!res.ok) setPlaying(true);
    });
  }

  // Solo se pausa para decidir cuando el relato ya alcanzó ese momento.
  const showDecision =
    decision != null && queue.length === 0 && clock >= view.minute - 0.01;

  // Cuenta regresiva de la decisión: a los 7 segundos se elige sola.
  // El servidor aplica la misma regla si te fuiste de la pantalla.
  const [secsLeft, setSecsLeft] = useState(DECISION_SECONDS);
  useEffect(() => {
    if (!showDecision || !decision || busy) {
      setSecsLeft(DECISION_SECONDS);
      return;
    }
    if (secsLeft <= 0) {
      choose(decision.options[0].id);
      return;
    }
    const t = setTimeout(() => setSecsLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDecision, decision, busy, secsLeft]);

  // Al volver de otra pestaña, poner el partido al día
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (finished || busy) return;
      setBusy(true);
      advanceMatch(matchId).then(handle);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, finished, busy, handle]);

  // El marcador debe reflejar lo que el relato YA mostró: si el servidor
  // va adelantado, el gol todavía no se cantó y no debe aparecer.
  const [shownHome, shownAway] = useMemo(() => {
    let h = 0;
    let a = 0;
    for (const e of events) {
      if (e.type === "goal") {
        if (e.side === "home") h++;
        else a++;
      }
    }
    return [h, a];
  }, [events]);

  // En copa hay prórroga: el reloj llega hasta 120.
  const fullTime = view.phase === "extra_time" || view.minute > 90 ? 120 : 90;
  const shownMinute = Math.min(fullTime, Math.floor(clock));
  const progress = Math.min(100, (clock / fullTime) * 100);

  return (
    <div className="space-y-3">
      {/* ── MARCADOR FIJO ─────────────────────────────── */}
      <div
        className={cn(
          "sticky top-0 z-20 overflow-hidden rounded-2xl border bg-surface shadow-e2 transition-colors duration-500",
          flash === "goal"
            ? "border-turf ring-2 ring-turf/50"
            : flash === "conceded"
              ? "border-danger/60"
              : "border-border"
        )}
      >
        <div className="flex items-center justify-between gap-2 p-4 pb-3">
          <TeamSide side={view.home} align="left" />
          <div className="text-center">
            <div
              className={cn(
                "font-display text-4xl font-extrabold leading-none tabular-nums transition-transform duration-300",
                flash && "scale-125"
              )}
            >
              {finished ? view.score[0] : shownHome}
              <span className="mx-1 text-muted">-</span>
              {finished ? view.score[1] : shownAway}
            </div>
            {view.shootout && (
              <p className="mt-0.5 text-xs text-trophy">
                pen. {view.shootout.home}-{view.shootout.away}
              </p>
            )}
            <p className="mt-1 text-xs font-semibold text-turf">
              {finished ? "FINAL" : `${shownMinute}'`}
            </p>
          </div>
          <TeamSide side={view.away} align="right" />
        </div>

        <div className="mx-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-turf transition-[opacity,transform] duration-500"
            style={{ transform: `scaleX(${(finished ? 100 : progress) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </div>

        {finished && reward != null && reward > 0 && (
          <div className="m-3">
            <RewardBurst coins={reward} />
          </div>
        )}

        {!finished && !showDecision && (
          <div className="flex gap-2 p-3">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold"
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "Pausar" : "Reanudar"}
            </button>
            {/* Adelantar: lleva el reloj hasta donde el servidor ya resolvió */}
            <button
              onClick={() => setClock(view.minute)}
              aria-label="Adelantar el relato"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-muted"
            >
              <FastForward size={15} />
            </button>
            {view.home.subsLeft > 0 && (
              <button
                onClick={() => {
                  setPlaying(false);
                  setShowSubs(true);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-muted"
              >
                <Repeat size={15} /> {view.home.subsLeft}
              </button>
            )}
          </div>
        )}

        {finished && (
          <div className="space-y-2 p-3">
            <Button
              fullWidth
              size="lg"
              onClick={() => (onExit ? onExit() : router.push("/play"))}
            >
              <Swords size={17} /> Jugar otro partido
            </Button>
            <button
              onClick={() => router.push(`/match/${matchId}`)}
              className="w-full rounded-lg py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
            >
              Ver resumen del partido
            </button>
          </div>
        )}
      </div>

      {/* ── MENTALIDAD: se puede cambiar en cualquier momento ── */}
      {!finished && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Mentalidad</span>
            <span className="text-xs font-bold text-turf">
              {MENTALITY_LEVELS[mentality]?.label}
            </span>
          </div>
          <div className="flex gap-1">
            {MENTALITY_LEVELS.map((m, i) => (
              <button
                key={m.id}
                onClick={() => pickMentality(i)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-[10px] font-bold transition active:scale-95",
                  i === mentality
                    ? i <= 1
                      ? "bg-sky-400 text-bg"
                      : i === 2
                        ? "bg-turf text-turf-ink"
                        : "bg-danger text-white"
                    : "bg-surface-2 text-muted hover:text-text"
                )}
              >
                {["⬇⬇", "⬇", "＝", "⬆", "⬆⬆"][i]}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-muted">
            <span>Defender</span>
            <span>Atacar</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── DECISIÓN ──────────────────────────────────── */}
      {showDecision && decision && (
        <div className="animate-fade-up space-y-2 rounded-2xl border border-turf/40 bg-surface p-4 shadow-glow">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="eyebrow text-turf">
                {decision.kind === "talk"
                  ? "Vestuario"
                  : decision.kind === "star"
                    ? "Momento clave"
                    : decision.kind === "penalty"
                      ? "Penales"
                      : "Decisión táctica"}
              </p>
              <h2 className="text-lg font-extrabold">{decision.title}</h2>
            </div>
            {decision.allowSub && view.home.subsLeft > 0 && (
              <button
                onClick={() => setShowSubs(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-semibold"
              >
                <Repeat size={13} /> Cambios ({view.home.subsLeft})
              </button>
            )}
          </div>
          <p className="pb-1 text-sm text-muted">{decision.subtitle}</p>
          <p
            className={cn(
              "pb-1 text-center text-xs font-bold tabular-nums",
              secsLeft <= 3 ? "text-danger" : "text-muted"
            )}
          >
            Se elige sola en {Math.max(0, secsLeft)}s
          </p>

          <div className="space-y-2">
            {decision.options.map((o) => {
              const Icon = TONE_ICON[o.tone ?? "neutral"];
              return (
                <button
                  key={o.id}
                  onClick={() => choose(o.id)}
                  disabled={busy}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-50",
                    TONE_STYLE[o.tone ?? "neutral"]
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="flex-1">
                    <span className="block font-bold">{o.label}</span>
                    {o.hint && (
                      <span className="block text-xs text-muted">{o.hint}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RELATO ────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="eyebrow">Relato en vivo</span>
          {busy && <span className="text-[11px] text-muted">…</span>}
        </div>
        <div
          ref={feedRef}
          className="h-[38vh] min-h-[220px] space-y-1.5 overflow-y-auto scroll-smooth p-2"
        >
          {events.map((e, i) => (
            <EventRow key={i} ev={e} />
          ))}
        </div>
      </div>

      {/* ── ESTAMINA ──────────────────────────────────── */}
      <StaminaPanel view={view} />

      {/* ── MODAL DE CAMBIOS ──────────────────────────── */}
      {showSubs && (
        <SubsModal
          view={view}
          onClose={() => setShowSubs(false)}
          onSub={doSub}
          busy={busy}
        />
      )}
    </div>
  );
}

function TeamSide({
  side,
  align,
}: {
  side: {
    name: string;
    crestClub?: string | null;
    avgOverall?: number | null;
    chemistry?: number | null;
    onPitch: { overall: number }[];
  };
  align: "left" | "right";
}) {
  const avg = side.avgOverall ?? avgOf(side);
  const chem = side.chemistry;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-1",
        align === "right" ? "sm:items-end" : "sm:items-start"
      )}
    >
      {/* El escudo sale del club elegido por el usuario, no del nombre */}
      <ClubCrest club={side.crestClub || side.name} size={34} />
      <p className="w-full truncate text-center text-[11px] font-bold leading-tight sm:text-left">
        {side.name}
      </p>
      <p className="w-full text-center text-[10px] leading-none text-muted sm:text-left">
        media <b className="font-display text-text">{avg}</b>
        {chem != null && (
          <>
            {" · "}quím{" "}
            <b
              className={cn(
                "font-display",
                chem >= 75 ? "text-turf" : chem >= 45 ? "text-trophy" : "text-danger"
              )}
            >
              {chem}
            </b>
          </>
        )}
      </p>
    </div>
  );
}

/** Media del once en cancha (los suplentes no cuentan). */
function avgOf(t: { onPitch: { overall: number }[] }): number {
  if (t.onPitch.length === 0) return 0;
  return Math.round(
    t.onPitch.reduce((sum, p) => sum + p.overall, 0) / t.onPitch.length
  );
}

function staminaColor(v: number) {
  if (v >= 70) return "bg-turf";
  if (v >= 45) return "bg-trophy";
  return "bg-danger";
}

function StaminaPanel({ view }: { view: PublicMatchView }) {
  const [tab, setTab] = useState<"home" | "away">("home");
  const team = tab === "home" ? view.home : view.away;
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex gap-1 border-b border-border p-1">
        {(["home", "away"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 truncate rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              tab === t ? "bg-turf text-turf-ink" : "text-muted"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <ClubCrest
                club={
                  (t === "home" ? view.home.crestClub : view.away.crestClub) ||
                  (t === "home" ? view.home.name : view.away.name)
                }
                size={15}
              />
              <span className="truncate">
                {t === "home" ? view.home.name : view.away.name}
              </span>
              <span className="font-display shrink-0 font-extrabold">
                {avgOf(t === "home" ? view.home : view.away)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-3">
        {team.onPitch.map((p) => (
          <div key={p.name} className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 text-[10px] font-bold text-muted">
              {p.pos}
            </span>
            <span className="font-display w-5 shrink-0 text-center text-[12px] font-extrabold tabular-nums">
              {p.overall}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[11px]",
                p.sentOff && "text-danger line-through"
              )}
            >
              {p.name}
            </span>
            {p.goals > 0 && (
              <span className="text-[10px] text-turf">⚽{p.goals > 1 ? p.goals : ""}</span>
            )}
            {p.yellow && (
              <span className="h-2.5 w-1.5 shrink-0 rounded-sm bg-yellow-400" />
            )}
            <div className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full",
                  staminaColor(p.stamina)
                )}
                style={{ transform: `scaleX(${(p.stamina) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Suplentes del equipo elegido */}
      {team.bench.length > 0 && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <p className="eyebrow mb-1">Suplentes · media {avgOf(team)}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {team.bench.map((p) => (
              <div key={p.name} className="flex items-center gap-1.5">
                <span className="w-7 shrink-0 text-[10px] font-bold text-muted">
                  {p.pos}
                </span>
                <span className="font-display w-5 shrink-0 text-center text-[12px] font-extrabold tabular-nums">
                  {p.overall}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                  {p.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-bold tabular-nums",
                    p.stamina >= 85 ? "text-turf" : p.stamina >= 65 ? "text-trophy" : "text-danger"
                  )}
                >
                  {p.stamina}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubsModal({
  view,
  onClose,
  onSub,
  busy,
}: {
  view: PublicMatchView;
  onClose: () => void;
  onSub: (out: string, inName: string) => void;
  busy: boolean;
}) {
  const [out, setOut] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-app animate-fade-up overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {out ? "¿Quién entra?" : "¿Quién sale?"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:text-text"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Te quedan {view.home.subsLeft} cambios.
        </p>

        {!out ? (
          <div className="space-y-1.5">
            {view.home.onPitch
              .filter((p) => !p.sentOff)
              .sort((a, b) => a.stamina - b.stamina)
              .map((p) => (
                <button
                  key={p.name}
                  onClick={() => setOut(p.name)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left hover:border-turf/50"
                >
                  <span className="w-9 text-center text-xs font-bold text-muted">
                    {p.pos}
                  </span>
                  <span className="font-display w-7 text-center font-extrabold">
                    {p.overall}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.name}
                  </span>
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn("h-full", staminaColor(p.stamina))}
                      style={{ transform: `scaleX(${(p.stamina) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-muted">
                    {p.stamina}%
                  </span>
                </button>
              ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={() => setOut(null)}
              className="mb-2 text-xs text-muted hover:text-text"
            >
              ← Elegir otro
            </button>
            {view.home.bench.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                No tenés suplentes en el banco.
              </p>
            )}
            {view.home.bench.map((p) => (
              <button
                key={p.name}
                onClick={() => onSub(out, p.name)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left hover:border-turf/50 disabled:opacity-50"
              >
                <span className="w-9 text-center text-xs font-bold text-muted">
                  {p.pos}
                </span>
                <span className="font-display w-7 text-center font-extrabold">
                  {p.overall}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <span className="text-xs text-turf">Entra</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DOT: Record<string, string> = {
  goal: "bg-turf",
  yellow: "bg-yellow-400",
  red: "bg-danger",
  sub: "bg-sky-400",
  injury: "bg-orange-400",
  penalty: "bg-trophy",
};

function EventRow({ ev }: { ev: MatchEvent }) {
  const isBig =
    ev.type === "kickoff" ||
    ev.type === "halftime" ||
    ev.type === "fulltime" ||
    ev.type === "et_start" ||
    ev.type === "penalties";
  return (
    <div
      className={cn(
        "flex animate-fade-up items-start gap-2.5 rounded-lg px-2.5 py-1.5",
        ev.type === "goal"
          ? "border border-turf/40 bg-turf-soft/40"
          : isBig
            ? "bg-surface"
            : ""
      )}
    >
      <span className="w-6 shrink-0 pt-0.5 text-right text-[11px] font-bold tabular-nums text-muted">
        {ev.minute}&apos;
      </span>
      <span
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          DOT[ev.type] ?? "bg-border"
        )}
      />
      <p
        className={cn(
          "text-[13px] leading-snug",
          ev.type === "goal" ? "font-semibold text-text" : "text-text/80"
        )}
      >
        {ev.text}
      </p>
    </div>
  );
}
