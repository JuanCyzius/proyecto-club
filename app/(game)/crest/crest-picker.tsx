"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { chooseCrest, drawStarterCrests, type Crest } from "./actions";

export function CrestPicker({
  clubName,
  chosen,
  current,
  owned,
}: {
  clubName: string;
  chosen: boolean;
  current: string | null;
  owned: Crest[];
}) {
  const router = useRouter();
  const [crests, setCrests] = useState<Crest[]>(owned);
  const [opened, setOpened] = useState(chosen || owned.length > 0);
  const [shaking, setShaking] = useState(false);
  const [selected, setSelected] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open() {
    setError(null);
    setShaking(true);
    start(async () => {
      const res = await drawStarterCrests();
      // Deja correr la animación del sobre antes de revelar
      setTimeout(() => {
        setShaking(false);
        if (res.ok) {
          setCrests(res.crests);
          setOpened(true);
        } else setError(res.error);
      }, 1200);
    });
  }

  function confirm() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await chooseCrest(selected);
      if (res.ok) router.push("/squad");
      else setError(res.error ?? "No se pudo guardar el escudo.");
    });
  }

  function pick(club: string) {
    setSelected(club);
    if (chosen) {
      // Ya tiene club: el cambio se aplica al instante
      start(async () => {
        const res = await chooseCrest(club);
        if (!res.ok) setError(res.error ?? "No se pudo cambiar el escudo.");
        else router.refresh();
      });
    }
  }

  // ── Sobre sin abrir ──
  if (!opened) {
    return (
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col items-center gap-5 rounded-3xl border border-trophy/40 bg-trophy-soft/15 px-6 py-10 text-center">
          <div className={cn("gpu", shaking && "crest-shake")}>
            <Envelope />
          </div>
          <div>
            <p className="font-display text-xl font-extrabold">
              Sobre de escudos
            </p>
            <p className="mx-auto mt-1 max-w-[34ch] text-sm leading-snug text-muted">
              Adentro hay cuatro escudos. Vas a quedarte con uno como
              identidad de {clubName}.
            </p>
          </div>
          <Button size="lg" onClick={open} disabled={pending || shaking}>
            <Sparkles size={17} />
            {shaking ? "Abriendo…" : "Abrir sobre"}
          </Button>
        </div>

        <style jsx global>{`
          @keyframes crestShake {
            0%, 100% { transform: rotate(0) scale(1); }
            25% { transform: rotate(-5deg) scale(1.04); }
            50% { transform: rotate(6deg) scale(1.07); }
            75% { transform: rotate(-6deg) scale(1.09); }
          }
          .crest-shake { animation: crestShake 0.45s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .crest-shake { animation: none; }
          }
        `}</style>
      </div>
    );
  }

  // ── Escudos revelados ──
  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3">
        {crests.map((c, i) => {
          const active = selected === c.club_name;
          return (
            <button
              key={c.club_name}
              onClick={() => pick(c.club_name)}
              disabled={pending}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cn(
                "flex animate-scale-in flex-col items-center gap-2 rounded-2xl border p-4 transition-[border-color,background-color,transform] duration-150 active:scale-[0.97]",
                active
                  ? "border-turf bg-turf-soft/30 shadow-glow"
                  : "border-border bg-surface hover:border-border-strong"
              )}
            >
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.logo_path}
                  alt={`Escudo de ${c.club_name}`}
                  width={72}
                  height={72}
                  loading="lazy"
                  className="h-[72px] w-[72px] object-contain"
                />
                {active && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-turf text-turf-ink">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "line-clamp-2 text-center text-[11px] font-semibold leading-tight",
                  active ? "text-turf" : "text-muted"
                )}
              >
                {c.club_name}
              </span>
            </button>
          );
        })}
      </div>

      {!chosen && (
        <>
          <p className="px-1 text-center text-[11px] text-muted">
            Podrás conseguir más escudos en los sobres y cambiarlo cuando
            quieras.
          </p>
          <Button
            fullWidth
            size="lg"
            disabled={pending || !selected}
            onClick={confirm}
          >
            <Shield size={17} />
            {!selected
              ? "Elegí un escudo"
              : pending
                ? "Guardando…"
                : "Usar este escudo"}
          </Button>
        </>
      )}
    </div>
  );
}

function Envelope() {
  return (
    <svg width="132" height="176" viewBox="0 0 132 176" aria-hidden>
      <defs>
        <linearGradient id="crestEnv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5C451" stopOpacity="0.95" />
          <stop offset="1" stopColor="#0A0F14" />
        </linearGradient>
      </defs>
      <rect
        x="8"
        y="8"
        width="116"
        height="160"
        rx="12"
        fill="url(#crestEnv)"
        stroke="#F5C451"
        strokeWidth="2"
      />
      <path
        d="M8 20 L66 70 L124 20"
        fill="none"
        stroke="#F5C451"
        strokeWidth="2"
        opacity="0.7"
      />
      <path
        d="M66 96 l26 10 v22 c0 16 -12 27 -26 32 c-14 -5 -26 -16 -26 -32 v-22 z"
        fill="#fff"
        fillOpacity="0.8"
      />
    </svg>
  );
}
