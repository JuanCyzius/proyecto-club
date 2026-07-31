"use client";

import { useState } from "react";
import { ChevronDown, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORMATIONS } from "@/lib/formations";
import type { Position } from "@/lib/players";

export type TeamReportSide = {
  name: string;
  avgOverall: number | null;
  chemistry: number | null;
  starters: {
    name: string;
    position: Position;
    slotPos: Position;
    overall: number;
  }[];
};

export type TeamReport = { home: TeamReportSide; away: TeamReportSide };

function chemColor(c: number | null) {
  if (c === null) return "text-muted";
  if (c >= 75) return "text-turf";
  if (c >= 45) return "text-trophy";
  return "text-danger";
}

/** Mini cancha con el once, para ver cómo está formado un equipo. */
function MiniPitch({ side }: { side: TeamReportSide }) {
  const slots = FORMATIONS["4-3-3"];
  const byPos = new Map<string, TeamReportSide["starters"]>();
  for (const p of side.starters) {
    const list = byPos.get(p.slotPos) ?? [];
    list.push(p);
    byPos.set(p.slotPos, list);
  }
  const used = new Map<string, number>();

  return (
    <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl border border-border bg-turf-soft/10">
      <div className="absolute inset-2 rounded-lg border border-turf/20" />
      {slots.map((s) => {
        const list = byPos.get(s.pos) ?? [];
        const n = used.get(s.pos) ?? 0;
        const p = list[n];
        used.set(s.pos, n + 1);
        if (!p) return null;
        return (
          <div
            key={s.code}
            style={{
              left: `${Math.min(88, Math.max(12, s.x))}%`,
              top: `${Math.min(90, Math.max(10, s.y))}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          >
            <span className="flex flex-col items-center rounded-md bg-bg/85 px-1 py-0.5 backdrop-blur">
              <span className="font-display text-[11px] font-extrabold leading-none">
                {p.overall}
              </span>
              <span className="max-w-[54px] truncate text-[8px] leading-tight text-muted">
                {p.name.split(" ").slice(-1)[0]}
              </span>
              <span className="text-[7px] font-bold leading-none text-turf">
                {s.pos}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Media, química y onces de ambos equipos. */
export function TeamReportCard({ report }: { report: TeamReport }) {
  const [open, setOpen] = useState(false);
  const sides: [TeamReportSide, string][] = [
    [report.home, "Vos"],
    [report.away, "Rival"],
  ];

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        {sides.map(([s, label]) => (
          <div key={label} className="space-y-0.5 text-center">
            <p className="eyebrow">{label}</p>
            <p className="truncate text-sm font-bold">{s.name}</p>
            <p className="flex items-center justify-center gap-1 text-xs">
              <Users size={11} className="text-muted" />
              <span className="font-display text-base font-extrabold">
                {s.avgOverall ?? "—"}
              </span>
              <span className="text-muted">media</span>
            </p>
            <p className="flex items-center justify-center gap-1 text-xs">
              <Sparkles size={11} className={chemColor(s.chemistry)} />
              <span className={cn("font-bold", chemColor(s.chemistry))}>
                {s.chemistry ?? "—"}
              </span>
              <span className="text-muted">química</span>
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted"
      >
        {open ? "Ocultar los onces" : "Ver los onces"}
        <ChevronDown size={13} className={cn("transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-2">
          {sides.map(([s, label]) => (
            <div key={label} className="space-y-1">
              <p className="truncate text-center text-[10px] font-bold text-muted">
                {label} · {s.name}
              </p>
              <MiniPitch side={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
