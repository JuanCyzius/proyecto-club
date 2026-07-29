"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Coins, Swords, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { List } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { Avatar } from "@/components/ui/avatar";
import { coins as fmt } from "@/lib/format";
import { periodRanking, type RankRow } from "./ranking-actions";

/** Ranking del día y de la semana por actividad. */
export function PeriodRanking({
  userId,
  initial,
}: {
  userId: string;
  initial: RankRow[];
}) {
  const [metric, setMetric] = useState<"matches" | "coins">("matches");
  const [period, setPeriod] = useState<"day" | "week">("week");
  const [rows, setRows] = useState<RankRow[]>(initial);
  const [pending, start] = useTransition();
  const first = { m: metric, p: period };

  useEffect(() => {
    if (first.m === "matches" && first.p === "week") return; // ya viene cargado
    start(async () => setRows(await periodRanking(metric, period)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, period]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Toggle
          options={[
            { v: "matches", label: "Partidos", icon: Swords },
            { v: "coins", label: "Monedas", icon: Coins },
          ]}
          value={metric}
          onChange={(v) => setMetric(v as "matches" | "coins")}
        />
        <Toggle
          options={[
            { v: "day", label: "Hoy" },
            { v: "week", label: "Semana" },
          ]}
          value={period}
          onChange={(v) => setPeriod(v as "day" | "week")}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {pending ? "Cargando…" : "Todavía no hay actividad en este periodo."}
        </p>
      ) : (
        <List className={pending ? "opacity-50" : undefined}>
          {rows.map((r, i) => (
            <Link
              key={r.user_id}
              href={r.user_id === userId ? "/club" : `/clubs/${r.user_id}`}
              className={cn(
                "row tap hover:bg-surface-2",
                r.user_id === userId && "bg-turf-soft/25"
              )}
            >
              <span
                className={cn(
                  "w-6 text-center text-xs font-bold",
                  i === 0 ? "text-trophy" : i < 3 ? "text-turf" : "text-muted"
                )}
              >
                {i === 0 ? <Crown size={13} className="mx-auto" /> : i + 1}
              </span>
              {r.crest_club ? (
                <ClubCrest club={r.crest_club} size={28} />
              ) : (
                <Avatar label={r.club_name} className="h-7 w-7 text-[10px]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {r.club_name}
                </span>
                <span className="text-[10px] text-muted">@{r.username}</span>
              </span>
              <span
                className={cn(
                  "font-display text-base font-extrabold tabular-nums",
                  metric === "coins" ? "text-trophy" : "text-turf"
                )}
              >
                {metric === "coins" ? fmt(r.value) : r.value}
              </span>
            </Link>
          ))}
        </List>
      )}
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string; icon?: typeof Coins }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-1 gap-1 rounded-xl border border-border bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] font-semibold transition-colors",
            value === o.v ? "bg-turf text-turf-ink" : "text-muted hover:text-text"
          )}
        >
          {o.icon && <o.icon size={12} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
