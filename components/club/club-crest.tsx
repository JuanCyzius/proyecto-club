"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CLUB_LOGOS from "@/lib/club-logos.json";

const LOGOS = CLUB_LOGOS as Record<string, string>;

export function clubLogo(clubName?: string | null): string | null {
  if (!clubName) return null;
  return LOGOS[clubName.trim()] ?? null;
}

export function hasClubLogo(clubName?: string | null): boolean {
  return clubLogo(clubName) !== null;
}

/**
 * Escudo de club. Los archivos ya vienen normalizados a un lienzo
 * cuadrado de 96×96 con el escudo centrado, así que basta con fijar
 * el tamaño: nunca se deforman ni se descuadran.
 *
 * Si el club no tiene escudo, muestra un respaldo con sus iniciales.
 */
export function ClubCrest({
  club,
  size = 24,
  className,
  showFallback = true,
  style,
}: {
  club?: string | null;
  size?: number;
  className?: string;
  showFallback?: boolean;
  /** Permite dimensionarlo con unidades relativas (cqw, %, em). */
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const src = clubLogo(club);

  if (!src || failed) {
    if (!showFallback) return null;
    const initials = (club ?? "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-display font-bold text-muted",
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.4, ...style }}
        aria-hidden
        title={club ?? undefined}
      >
        {initials || "—"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={club ? `Escudo de ${club}` : "Escudo"}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}
