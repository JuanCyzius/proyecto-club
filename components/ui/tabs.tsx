"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pestañas con indicador deslizante: el usuario ve de dónde viene y
 * a dónde va, en vez de un salto seco de color.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; badge?: number }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  return (
    <div
      role="tablist"
      className={cn(
        "relative flex rounded-xl border border-border bg-surface p-1",
        className
      )}
    >
      {/* Indicador */}
      <div
        aria-hidden
        className="absolute inset-y-1 rounded-lg bg-turf"
        style={{
          width: `calc((100% - 8px) / ${tabs.length})`,
          transform: `translate3d(calc(${index} * 100%), 0, 0)`,
          transition: "transform 250ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold",
            "transition-colors duration-200",
            value === t.value ? "text-turf-ink" : "text-muted hover:text-text"
          )}
        >
          <span className="truncate">{t.label}</span>
          {t.badge != null && t.badge > 0 && (
            <span
              className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                value === t.value
                  ? "bg-turf-ink/20 text-turf-ink"
                  : "bg-trophy text-bg"
              )}
            >
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
