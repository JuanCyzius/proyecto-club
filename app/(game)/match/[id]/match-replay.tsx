"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Pause, FastForward, ArrowLeft, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClubCrest } from "@/components/club/club-crest";
import type { MatchEvent, PlayerRating, TeamStats } from "@/lib/sim/types";

function delayFor(ev: MatchEvent): number {
  switch (ev.type) {
    case "goal":
      return 1100;
    case "kickoff":
    case "halftime":
    case "fulltime":
    case "et_start":
    case "et_end":
    case "penalties":
    case "shootout_end":
      return 850;
    case "chance":
      return 260;
    default:
      return 420;
  }
}

export function MatchReplay({
  homeName,
  awayName,
  homeScore,
  awayScore,
  events,
  stats,
  ratings,
  wentToPenalties,
  penalties,
  rewardCoins,
}: {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  stats: { home: TeamStats; away: TeamStats };
  ratings: { home: PlayerRating[]; away: PlayerRating[] };
  wentToPenalties: boolean;
  penalties: [number, number] | null;
  rewardCoins?: number | null;
}) {
  const [idx, setIdx] = useState(1);
  const [playing, setPlaying] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  const finished = idx >= events.length;

  useEffect(() => {
    if (!playing || finished) return;
    const t = setTimeout(() => setIdx((i) => i + 1), delayFor(events[idx]));
    return () => clearTimeout(t);
  }, [idx, playing, finished, events]);

  const revealed = useMemo(() => events.slice(0, idx), [events, idx]);

  // Auto-scroll dentro del recuadro (no mueve la página).
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealed.length]);

  const clock = revealed.length ? revealed[revealed.length - 1].minute : 0;

  const [rh, ra] = useMemo(() => {
    let h = 0;
    let a = 0;
    for (const e of revealed) {
      if (e.type === "goal") {
        if (e.side === "home") h++;
        else a++;
      }
    }
    return [h, a];
  }, [revealed]);

  const motm = useMemo(() => {
    const all = [
      ...ratings.home.map((r) => ({ ...r, team: homeName })),
      ...ratings.away.map((r) => ({ ...r, team: awayName })),
    ];
    return all.sort((x, y) => y.rating - x.rating)[0];
  }, [ratings, homeName, awayName]);

  const progress = Math.min(100, (clock / 90) * 100);

  return (
    <div className="space-y-3">
      <Link
        href="/play"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> Jugar otro
      </Link>

      {/* ── PANEL FIJO: marcador + recompensa ─────────────── */}
      <div className="sticky top-0 z-20 rounded-2xl border border-border bg-surface shadow-e2">
        <div className="flex items-center justify-between gap-2 p-4 pb-3">
          <TeamName name={homeName} align="left" />
          <div className="text-center">
            <div className="font-display text-4xl font-extrabold leading-none tabular-nums">
              {finished ? homeScore : rh}
              <span className="mx-1 text-muted">-</span>
              {finished ? awayScore : ra}
            </div>
            {wentToPenalties && penalties && finished && (
              <p className="mt-0.5 text-xs text-trophy">
                pen. {penalties[0]}-{penalties[1]}
              </p>
            )}
            <p className="mt-1 text-xs font-semibold text-turf">
              {finished ? "FINAL" : `${clock}'`}
            </p>
          </div>
          <TeamName name={awayName} align="right" />
        </div>

        {/* Barra de progreso del partido */}
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-turf transition-[opacity,transform] duration-300"
            style={{ transform: `scaleX(${(finished ? 100 : progress) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </div>

        {/* Recompensa: visible sin hacer scroll */}
        {finished && rewardCoins != null && rewardCoins > 0 && (
          <div className="m-3 mt-3 flex animate-fade-up items-center gap-2 rounded-xl border border-trophy/40 bg-trophy-soft/40 px-3 py-2">
            <Coins size={16} className="text-trophy" />
            <span className="flex-1 text-xs font-semibold">Recompensa</span>
            <span className="font-display text-base font-extrabold text-trophy">
              +{rewardCoins.toLocaleString("es")}
            </span>
          </div>
        )}

        {/* Controles */}
        {!finished ? (
          <div className="flex gap-2 p-3 pt-3">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold"
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "Pausar" : "Reanudar"}
            </button>
            <button
              onClick={() => {
                setIdx(events.length);
                setPlaying(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-muted"
            >
              <FastForward size={15} /> Saltar
            </button>
          </div>
        ) : (
          <div className="p-3 pt-3">
            <button
              onClick={() => {
                setIdx(1);
                setPlaying(true);
              }}
              className="w-full rounded-xl border border-border bg-surface-2 py-2 text-sm font-semibold text-muted hover:text-text"
            >
              Ver de nuevo
            </button>
          </div>
        )}
      </div>

      {/* ── RECUADRO DEL RELATO (scroll interno) ──────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="eyebrow">Relato en vivo</span>
          <span className="text-[11px] tabular-nums text-muted">
            {revealed.length}/{events.length}
          </span>
        </div>
        <div
          ref={feedRef}
          className="h-[46vh] min-h-[260px] space-y-1.5 overflow-y-auto scroll-smooth p-2"
        >
          {revealed.map((e, i) => (
            <EventRow key={i} ev={e} />
          ))}
        </div>
      </div>

      {/* ── RESUMEN ───────────────────────────────────────── */}
      {finished && (
        <div className="space-y-3">
          <p className="eyebrow px-1">Resumen</p>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-e2">
            <StatRow
              label="Posesión"
              h={`${stats.home.possession}%`}
              a={`${stats.away.possession}%`}
              hp={stats.home.possession}
            />
            <StatRow
              label="Ocasiones"
              h={stats.home.chances}
              a={stats.away.chances}
              hp={bar(stats.home.chances, stats.away.chances)}
            />
            <StatRow
              label="Remates"
              h={stats.home.shots}
              a={stats.away.shots}
              hp={bar(stats.home.shots, stats.away.shots)}
            />
            <StatRow
              label="Amarillas"
              h={stats.home.yellow}
              a={stats.away.yellow}
              hp={bar(stats.home.yellow, stats.away.yellow)}
            />
            <StatRow
              label="Rojas"
              h={stats.home.red}
              a={stats.away.red}
              hp={bar(stats.home.red, stats.away.red)}
              last
            />
          </div>
          {motm && (
            <div className="flex items-center gap-3 rounded-2xl border border-turf/30 bg-turf-soft/40 p-3">
              <span className="rounded-lg bg-turf px-2 py-1 text-xs font-bold text-turf-ink">
                MVP
              </span>
              <span className="flex-1 text-sm font-semibold">
                {motm.name} <span className="text-muted">· {motm.team}</span>
              </span>
              <span className="font-display text-lg font-extrabold text-turf">
                {motm.rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function bar(h: number, a: number): number {
  const t = h + a;
  return t === 0 ? 50 : Math.round((h / t) * 100);
}

function TeamName({ name, align }: { name: string; align: "left" | "right" }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <ClubCrest club={name} size={32} />
      <p className="w-full truncate text-center text-[11px] font-bold leading-tight">
        {name}
      </p>
    </div>
  );
}

function StatRow({
  label,
  h,
  a,
  hp,
  last,
}: {
  label: string;
  h: string | number;
  a: string | number;
  hp: number;
  last?: boolean;
}) {
  return (
    <div className={cn(!last && "mb-3")}>
      <div className="mb-1 flex justify-between text-sm">
        <b className="tabular-nums">{h}</b>
        <span className="text-xs text-muted">{label}</span>
        <b className="tabular-nums">{a}</b>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-turf" style={{ transform: `scaleX(${(hp) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }} />
        <div className="bg-trophy/70" style={{ transform: `scaleX(${(100 - hp) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }} />
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
};

function EventRow({ ev }: { ev: MatchEvent }) {
  const isBig =
    ev.type === "kickoff" ||
    ev.type === "halftime" ||
    ev.type === "fulltime" ||
    ev.type === "shootout_end" ||
    ev.type === "et_start";
  const dot = DOT[ev.type];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-2.5 py-1.5",
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
          dot ?? "bg-border"
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
