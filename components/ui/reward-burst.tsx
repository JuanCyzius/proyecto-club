"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { coins as fmtCoins } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks/use-motion";

/**
 * Recompensa que se siente. Aparece con escala, el número sube desde
 * cero y unas pocas chispas suben y se desvanecen. Nada de números
 * que simplemente cambian.
 */
export function RewardBurst({
  coins,
  label = "Recompensa",
  extra,
  tone = "trophy",
  className,
}: {
  coins: number;
  label?: string;
  extra?: string;
  tone?: "trophy" | "turf";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? coins : 0);

  useEffect(() => {
    if (reduced) {
      setShown(coins);
      return;
    }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(coins * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [coins, reduced]);

  // Chispas con posiciones estables entre renders
  const sparks = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        left: 12 + ((i * 37) % 76),
        delay: (i % 4) * 90,
        size: 7 + (i % 3) * 3,
      })),
    []
  );

  const color = tone === "trophy" ? "text-trophy" : "text-turf";
  const ring =
    tone === "trophy"
      ? "border-trophy/45 bg-trophy-soft/45"
      : "border-turf/45 bg-turf-soft/45";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3.5 text-center animate-scale-in gpu",
        ring,
        className
      )}
    >
      {!reduced &&
        sparks.map((s, i) => (
          <Sparkles
            key={i}
            size={s.size}
            className={cn("pointer-events-none absolute bottom-2 animate-float-up", color)}
            style={{
              left: `${s.left}%`,
              animationDelay: `${s.delay}ms`,
              opacity: 0.75,
            }}
          />
        ))}

      <p className={cn("flex items-center justify-center gap-1.5 text-xs font-bold", color)}>
        <Coins size={13} /> {label}
      </p>
      <p className={cn("mt-0.5 font-display text-3xl font-extrabold tabular-nums", color)}>
        +{fmtCoins(shown)}
      </p>
      {extra && <p className="mt-0.5 text-xs text-muted">{extra}</p>}
    </div>
  );
}
