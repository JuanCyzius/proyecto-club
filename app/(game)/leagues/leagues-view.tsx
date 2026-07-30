"use client";

import { useState, useTransition } from "react";
import { Counter } from "@/components/ui/counter";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Swords,
  Coins,
  Play,
  Users,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { PeriodRanking } from "./period-ranking";
import type { DailyWinner } from "./ranking-actions";
import type { RankRow } from "./ranking-actions";
import {
  createWager,
  findRankedMatch,
  playAllPending,
  playPvpMatch,
} from "../play/pvp-actions";

export type StandingRow = {
  userId: string;
  clubName: string;
  username: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

export type PendingMatch = {
  id: string;
  competition: string;
  home_user: string;
  away_user: string | null;
  home_name: string;
  away_name: string;
  stake: number;
  round: number | null;
};

export type Rival = {
  id: string;
  username: string;
  club_name: string;
  rating: number;
  division: number;
};

const COMP_LABEL: Record<string, string> = {
  league: "Liga",
  ranked: "Ranked",
  friendly: "Amistoso",
  cup: "Copa",
};

export function LeaguesView({
  userId,
  hasLeague,
  leagueName,
  standings,
  pending,
  rivals,
  coins,
  rating,
  division,
  rankedPlayed,
  rankedWon,
  ranking,
  dailyWinners,
}: {
  userId: string;
  hasLeague: boolean;
  leagueName: string | null;
  standings: StandingRow[];
  pending: PendingMatch[];
  rivals: Rival[];
  coins: number;
  rating: number;
  division: number;
  rankedPlayed: number;
  rankedWon: number;
  ranking: RankRow[];
  dailyWinners: DailyWinner[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<
    "league" | "ranked" | "activity" | "challenge"
  >("league");
  const [pendingTx, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [wagerRival, setWagerRival] = useState<Rival | null>(null);
  const [stake, setStake] = useState("500");

  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void
  ) {
    setError(null);
    setMsg(null);
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        onOk?.();
        router.refresh();
      } else setError(res.error ?? "No se pudo completar.");
    });
  }

  const myPending = pending.filter((p) => p.competition !== "cup");

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rating" value={String(rating)} accent="turf" />
        <Stat label="División" value={String(division)} accent="trophy" />
        <Stat
          label="Ranked"
          value={`${rankedWon}/${rankedPlayed}`}
          accent="muted"
        />
      </div>

      {error && (
        <Notice tone="error">{error}</Notice>
      )}
      {msg && (
        <Notice tone="success">{msg}</Notice>
      )}

      {/* Partidos pendientes */}
      {myPending.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-turf/40 bg-turf-soft/20 p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold text-turf">
              <Play size={15} /> {myPending.length} partido
              {myPending.length > 1 ? "s" : ""} por jugar
            </p>
            {myPending.length > 1 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pendingTx}
                onClick={() =>
                  run("all", playAllPending, () =>
                    setMsg("Jornada disputada.")
                  )
                }
              >
                {busy === "all" ? "Jugando…" : "Jugar todos"}
              </Button>
            )}
          </div>
          {myPending.slice(0, 6).map((m) => {
            const rival = m.home_user === userId ? m.away_name : m.home_name;
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
              >
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                  {COMP_LABEL[m.competition] ?? m.competition}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  vs {rival}
                </span>
                {m.stake > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-bold text-trophy">
                    <Coins size={11} /> {m.stake.toLocaleString("es")}
                  </span>
                )}
                <Button
                  size="sm"
                  disabled={pendingTx}
                  onClick={() =>
                    run(m.id, () => playPvpMatch(m.id), () =>
                      router.push(`/match/${m.id}`)
                    )
                  }
                >
                  {busy === m.id ? "…" : "Jugar"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Tabs
        tabs={[
          { value: "league", label: "Liga" },
          { value: "ranked", label: "Ranked" },
          { value: "activity", label: "Actividad" },
          { value: "challenge", label: "Retar" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      {/* ── LIGA ── */}
      {tab === "league" &&
        (!hasLeague ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
                <Trophy size={22} />
              </div>
              <div>
                <p className="font-semibold">Todavía no hay liga</p>
                <p className="mx-auto mt-1 max-w-[38ch] text-sm leading-snug text-muted">
                  La liga del grupo la abre el organizador. Cuando esté en
                  marcha vas a ver acá la tabla y tus partidos pendientes.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="eyebrow px-1">{leagueName}</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[10px] font-bold uppercase text-muted">
                <span className="w-5">#</span>
                <span className="flex-1">Club</span>
                <span className="w-6 text-center">PJ</span>
                <span className="w-6 text-center">DG</span>
                <span className="w-7 text-center">Pts</span>
              </div>
              {standings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Sin datos todavía.
                </p>
              ) : (
                standings.map((row, i) => (
                  <div
                    key={row.userId}
                    className={cn(
                      "flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0",
                      row.userId === userId && "bg-turf-soft/20"
                    )}
                  >
                    <span
                      className={cn(
                        "w-5 text-center text-xs font-bold",
                        i === 0
                          ? "text-trophy"
                          : i < 3
                            ? "text-turf"
                            : "text-muted"
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {row.clubName}
                      </span>
                      <span className="text-[10px] text-muted">
                        {row.won}G · {row.drawn}E · {row.lost}P
                      </span>
                    </span>
                    <span className="w-6 text-center text-xs tabular-nums text-muted">
                      {row.played}
                    </span>
                    <span
                      className={cn(
                        "w-6 text-center text-xs tabular-nums",
                        row.gf - row.ga > 0
                          ? "text-turf"
                          : row.gf - row.ga < 0
                            ? "text-danger"
                            : "text-muted"
                      )}
                    >
                      {row.gf - row.ga > 0 ? "+" : ""}
                      {row.gf - row.ga}
                    </span>
                    <span className="w-7 text-center font-display text-base font-extrabold">
                      {row.points}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

      {/* ── RANKED ── */}
      {tab === "ranked" && (
        <div className="space-y-3">
          <Card>
            <CardBody className="space-y-3 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft text-turf">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="font-semibold">Partido clasificatorio</p>
                <p className="mt-1 text-sm text-muted">
                  Te emparejamos con un club de nivel parecido. Ganar sube tu
                  rating y tu división.
                </p>
              </div>
              <Button
                fullWidth
                disabled={pendingTx}
                onClick={() =>
                  run("ranked", findRankedMatch, () =>
                    setMsg("Rival encontrado. Jugalo desde los pendientes.")
                  )
                }
              >
                <Swords size={16} />
                {busy === "ranked" ? "Buscando…" : "Buscar partido"}
              </Button>
            </CardBody>
          </Card>

          <div className="space-y-2">
            <p className="eyebrow px-1">Ranking del grupo</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {rivals.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Todavía no hay otros clubes.
                </p>
              ) : (
                rivals.slice(0, 15).map((r, i) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0"
                  >
                    <span className="w-5 text-center text-xs font-bold text-muted">
                      {i + 1}
                    </span>
                    <Avatar label={r.club_name} className="h-8 w-8 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {r.club_name}
                      </span>
                      <span className="text-[10px] text-muted">
                        @{r.username} · Div. {r.division}
                      </span>
                    </span>
                    <span className="font-display text-base font-extrabold text-turf">
                      {r.rating}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVIDAD ── */}
      {tab === "activity" && (
        <>
          {dailyWinners.length > 0 && (
            <div className="space-y-1.5 rounded-2xl border border-trophy/35 bg-trophy-soft/15 p-3">
              <p className="text-xs font-bold text-trophy">
                Premio de ayer · los que más jugaron
              </p>
              {dailyWinners.map((w) => (
                <div key={w.rank} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center font-display font-extrabold">
                    {w.rank}º
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {w.club_name}
                  </span>
                  <span className="text-[11px] text-muted">{w.matches} partidos</span>
                  <span className="font-bold text-trophy">+{w.coins}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted">
                Cada día: 700 / 500 / 400 monedas a los 3 clubes con más partidos.
              </p>
            </div>
          )}
          <PeriodRanking userId={userId} initial={ranking} />
        </>
      )}

      {/* ── RETAR ── */}
      {tab === "challenge" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
            <Coins size={16} className="text-trophy" />
            <span className="text-sm text-muted">Tu saldo</span>
            <span className="ml-auto font-display text-lg font-extrabold tabular-nums">
              <Counter value={coins} />
            </span>
          </div>
          <p className="px-1 text-[11px] text-muted">
            Ambos ponen la misma cantidad. El ganador se lleva el bote menos un
            5% de comisión. Si empatan, cada uno recupera lo suyo.
          </p>
          {rivals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No hay otros clubes todavía.
            </p>
          ) : (
            rivals.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <Avatar label={r.club_name} className="h-9 w-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {r.club_name}
                  </span>
                  <span className="text-[10px] text-muted">
                    @{r.username} · {r.rating} pts
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setWagerRival(r);
                    setStake("500");
                    setError(null);
                  }}
                >
                  <Users size={14} /> Retar
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Apuesta */}
      <Modal
        open={!!wagerRival}
        onClose={() => setWagerRival(null)}
        title={`Retar a ${wagerRival?.club_name ?? ""}`}
      >
        {wagerRival && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Ambos apuestan la misma cantidad. El bote va al ganador menos un
              5%.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Apuesta (mín. 100)
              </label>
              <Input
                inputMode="numeric"
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
              <p className="text-[10px] uppercase text-muted">
                El ganador recibe
              </p>
              <p className="font-display text-xl font-extrabold text-trophy">
                {Math.max(0, Math.floor(Number(stake || 0) * 2 * 0.95)).toLocaleString("es")}
              </p>
            </div>
            <Button
              fullWidth
              disabled={pendingTx || Number(stake) < 100 || Number(stake) > coins}
              onClick={() =>
                run(
                  "wager",
                  () => createWager(wagerRival.id, Number(stake)),
                  () => {
                    setWagerRival(null);
                    setMsg("Desafío creado. Jugalo desde los pendientes.");
                  }
                )
              }
            >
              <Swords size={16} />
              {Number(stake) > coins
                ? "Saldo insuficiente"
                : busy === "wager"
                  ? "Creando…"
                  : "Crear desafío"}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "turf" | "trophy" | "muted";
}) {
  const color =
    accent === "turf"
      ? "text-turf"
      : accent === "trophy"
        ? "text-trophy"
        : "text-text";
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-center shadow-e2">
      <p className={cn("text-xl font-extrabold tabular-nums", color)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
