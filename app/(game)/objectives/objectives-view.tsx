"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import {
  Gift,
  Target,
  Award,
  Crown,
  Coins,
  Check,
  Flame,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  claimAchievement,
  claimDaily,
  claimObjective,
  claimPassLevel,
} from "./actions";

export type Objective = {
  code: string;
  scope: "daily" | "weekly" | "season";
  name: string;
  description: string;
  target: number;
  progress: number;
  rewards: { coins?: number; xp?: number; items?: Record<string, number> };
  completed: boolean;
  claimed: boolean;
};

export type PassTier = {
  level: number;
  name: string;
  xp_needed: number;
  rewards: { coins?: number; items?: Record<string, number> };
  unlocked: boolean;
  claimed: boolean;
  season_xp: number;
};

export type Achievement = {
  code: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  rewards: { coins?: number; xp?: number };
  completed: boolean;
  claimed: boolean;
};

export type LeaderRow = {
  user_id: string;
  username: string;
  club_name: string;
  value: number;
  extra: number;
};

const SCOPE_LABEL: Record<string, string> = {
  daily: "Hoy",
  weekly: "Esta semana",
  season: "Temporada",
};

function rewardText(r: {
  coins?: number;
  xp?: number;
  items?: Record<string, number>;
}) {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins.toLocaleString("es")} monedas`);
  if (r.xp) parts.push(`${r.xp} XP`);
  if (r.items) {
    const n = Object.values(r.items).reduce((a, b) => a + b, 0);
    parts.push(`${n} ítem${n > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

export function ObjectivesView({
  objectives,
  pass,
  achievements,
  leaders,
  userId,
  dailyClaimed,
  streak,
}: {
  objectives: Objective[];
  pass: PassTier[];
  achievements: Achievement[];
  leaders: LeaderRow[];
  userId: string;
  dailyClaimed: boolean;
  streak: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"missions" | "pass" | "awards" | "ranking">(
    "missions"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string
  ) {
    setError(null);
    setMsg(null);
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        setMsg(okMsg);
        router.refresh();
      } else setError(res.error ?? "No se pudo reclamar.");
    });
  }

  const byScope = (s: string) => objectives.filter((o) => o.scope === s);
  const readyCount = objectives.filter((o) => o.completed && !o.claimed).length;
  const seasonXp = pass[0]?.season_xp ?? 0;
  const nextTier = pass.find((t) => !t.unlocked);

  return (
    <div className="space-y-4">
      {/* Recompensa diaria */}
      <Card
        className={cn(
          !dailyClaimed && "border-trophy/50 bg-trophy-soft/20"
        )}
      >
        <CardBody className="flex items-center gap-3 py-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              dailyClaimed
                ? "bg-surface-2 text-muted"
                : "bg-trophy/20 text-trophy"
            )}
          >
            <Gift size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Recompensa diaria</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Flame size={11} className={streak > 0 ? "text-trophy" : ""} />
              Racha de {streak} día{streak === 1 ? "" : "s"} · próxima{" "}
              {(100 + Math.min(streak + 1, 7) * 100).toLocaleString("es")}
            </p>
          </div>
          <Button
            size="sm"
            disabled={pending || dailyClaimed}
            variant={dailyClaimed ? "secondary" : "primary"}
            onClick={() =>
              run("daily", claimDaily, "¡Recompensa diaria cobrada!")
            }
          >
            {dailyClaimed ? (
              <>
                <Check size={14} /> Hoy
              </>
            ) : busy === "daily" ? (
              "…"
            ) : (
              "Reclamar"
            )}
          </Button>
        </CardBody>
      </Card>

      {error && (
        <Notice tone="error">{error}</Notice>
      )}
      {msg && (
        <Notice tone="success">{msg}</Notice>
      )}

      <Tabs
        tabs={[
          {
            value: "missions",
            label: readyCount > 0 ? `Misiones (${readyCount})` : "Misiones",
          },
          { value: "pass", label: "Pase" },
          { value: "awards", label: "Logros" },
          { value: "ranking", label: "Ranking" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />

      {/* ── MISIONES ── */}
      {tab === "missions" && (
        <div className="space-y-4">
          {(["daily", "weekly", "season"] as const).map((scope) => {
            const list = byScope(scope);
            if (list.length === 0) return null;
            return (
              <section key={scope} className="space-y-2">
                <p className="eyebrow px-1">{SCOPE_LABEL[scope]}</p>
                {list.map((o) => {
                  const pct = Math.min(
                    100,
                    Math.round((o.progress / o.target) * 100)
                  );
                  return (
                    <div
                      key={o.code}
                      className={cn(
                        "rounded-xl border bg-surface p-3",
                        o.claimed
                          ? "border-border opacity-60"
                          : o.completed
                            ? "border-turf/50 bg-turf-soft/15"
                            : "border-border"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Target
                          size={15}
                          className={cn(
                            "mt-0.5 shrink-0",
                            o.completed ? "text-turf" : "text-muted"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{o.name}</p>
                          <p className="text-xs text-muted">{o.description}</p>
                        </div>
                        {o.claimed ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-muted">
                            <Check size={13} /> Cobrado
                          </span>
                        ) : o.completed ? (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(
                                o.code,
                                () => claimObjective(o.code),
                                `¡${o.name} cobrado!`
                              )
                            }
                          >
                            {busy === o.code ? "…" : "Cobrar"}
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              o.completed ? "bg-turf" : "bg-trophy"
                            )}
                            style={{ transform: `scaleX(${(pct) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
                          />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-muted">
                          {o.progress}/{o.target}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-trophy">
                        <Coins size={10} /> {rewardText(o.rewards)}
                      </p>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* ── PASE ── */}
      {tab === "pass" && (
        <div className="space-y-3">
          <Card>
            <CardBody className="py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Sparkles size={15} className="text-trophy" />
                  XP de temporada
                </span>
                <span className="font-display text-lg font-extrabold text-trophy">
                  {seasonXp.toLocaleString("es")}
                </span>
              </div>
              {nextTier && (
                <p className="text-[11px] text-muted">
                  Te faltan {(nextTier.xp_needed - seasonXp).toLocaleString("es")} XP
                  para el nivel {nextTier.level} ({nextTier.name}).
                </p>
              )}
            </CardBody>
          </Card>

          {pass.map((t) => (
            <div
              key={t.level}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                t.claimed
                  ? "border-border bg-surface opacity-60"
                  : t.unlocked
                    ? "border-trophy/50 bg-trophy-soft/15"
                    : "border-border bg-surface"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold",
                  t.unlocked
                    ? "bg-trophy/20 text-trophy"
                    : "bg-surface-2 text-muted"
                )}
              >
                {t.level}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t.name}</p>
                <p className="text-[11px] text-muted">
                  {t.xp_needed.toLocaleString("es")} XP · {rewardText(t.rewards)}
                </p>
              </div>
              {t.claimed ? (
                <Check size={16} className="shrink-0 text-muted" />
              ) : t.unlocked ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      `pass${t.level}`,
                      () => claimPassLevel(t.level),
                      `¡Nivel ${t.level} del pase cobrado!`
                    )
                  }
                >
                  {busy === `pass${t.level}` ? "…" : "Cobrar"}
                </Button>
              ) : (
                <span className="shrink-0 text-[11px] text-muted">
                  Bloqueado
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── LOGROS ── */}
      {tab === "awards" && (
        <div className="space-y-2">
          {achievements.map((a) => {
            const pct = Math.min(
              100,
              Math.round((a.progress / a.target) * 100)
            );
            return (
              <div
                key={a.code}
                className={cn(
                  "rounded-xl border bg-surface p-3",
                  a.claimed
                    ? "border-border opacity-60"
                    : a.completed
                      ? "border-turf/50 bg-turf-soft/15"
                      : "border-border"
                )}
              >
                <div className="flex items-start gap-2">
                  <Award
                    size={15}
                    className={cn(
                      "mt-0.5 shrink-0",
                      a.completed ? "text-trophy" : "text-muted"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{a.name}</p>
                    <p className="text-xs text-muted">{a.description}</p>
                  </div>
                  {a.claimed ? (
                    <Check size={15} className="shrink-0 text-muted" />
                  ) : a.completed ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          a.code,
                          () => claimAchievement(a.code),
                          `¡Logro desbloqueado: ${a.name}!`
                        )
                      }
                    >
                      {busy === a.code ? "…" : "Cobrar"}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        a.completed ? "bg-turf" : "bg-muted"
                      )}
                      style={{ transform: `scaleX(${(pct) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted">
                    {a.progress}/{a.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── RANKING ── */}
      {tab === "ranking" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {leaders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Todavía no hay datos.
            </p>
          ) : (
            leaders.map((l, i) => (
              <div
                key={l.user_id}
                className={cn(
                  "flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0",
                  l.user_id === userId && "bg-turf-soft/20"
                )}
              >
                <span
                  className={cn(
                    "w-6 text-center text-xs font-bold",
                    i === 0
                      ? "text-trophy"
                      : i < 3
                        ? "text-turf"
                        : "text-muted"
                  )}
                >
                  {i === 0 ? <Crown size={13} className="mx-auto" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {l.club_name}
                  </span>
                  <span className="text-[10px] text-muted">
                    @{l.username} · Div. {l.extra}
                  </span>
                </span>
                <span className="font-display text-base font-extrabold text-turf">
                  {l.value}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
