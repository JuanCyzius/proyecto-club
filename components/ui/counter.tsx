"use client";

import { cn } from "@/lib/utils";
import { useCountUp, usePulse } from "@/lib/hooks/use-motion";
import { coins as fmtCoins } from "@/lib/format";

/**
 * Número que sube en lugar de saltar. Al cambiar, late brevemente:
 * el usuario ve QUE cambió, no solo el valor nuevo.
 */
export function Counter({
  value,
  className,
  format = fmtCoins,
  pulse = true,
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
  pulse?: boolean;
}) {
  const shown = useCountUp(value);
  const isPulsing = usePulse(value);
  return (
    <span
      className={cn(
        "inline-block tabular-nums",
        pulse && isPulsing && "animate-pop",
        className
      )}
    >
      {format(shown)}
    </span>
  );
}
