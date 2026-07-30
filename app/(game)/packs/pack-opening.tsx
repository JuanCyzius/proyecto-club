"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayerCard } from "@/components/player-card/player-card";
import { ClubCrest, clubLogo } from "@/components/club/club-crest";
import { Button } from "@/components/ui/button";
import { RARITY_LABEL, type Rarity } from "@/lib/players";
import { HeartPulse, Package } from "lucide-react";
import { Shield } from "lucide-react";
import { isCrest, isItem, type PulledCard } from "./types";

// Brillo y color del haz según la rareza: cuanto mejor, más espectacular.
const AURA: Record<Rarity, { glow: string; beam: string; label: string }> = {
  common: { glow: "#8a5a2b", beam: "#c98a4a", label: "text-[#e6cfa8]" },
  uncommon: { glow: "#aab7c2", beam: "#dfe7ec", label: "text-[#dfe7ec]" },
  rare: { glow: "#ecc65e", beam: "#ffe08a", label: "text-[#ffe08a]" },
  epic: { glow: "#6f86ff", beam: "#a8b6ff", label: "text-[#a8b6ff]" },
  legendary: { glow: "#ff5b6e", beam: "#ff97a3", label: "text-[#ff97a3]" },
  icon: { glow: "#f6e7b3", beam: "#fff4cf", label: "text-[#fff4cf]" },
};

const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  icon: 5,
};

type Stage = "shaking" | "burst" | "revealing" | "summary";

export function PackOpening({
  cards,
  onClose,
}: {
  cards: PulledCard[];
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("shaking");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // La carta más valiosa del sobre, para el "walkout" final
  // Rareza aparente de cada objeto: los escudos brillan como "raro".
  const rankOf = (c: PulledCard): Rarity =>
    isCrest(c) ? "rare" : c.rarity;

  const best = cards.reduce(
    (a, b) => (RARITY_RANK[rankOf(b)] > RARITY_RANK[rankOf(a)] ? b : a),
    cards[0]
  );

  useEffect(() => {
    if (stage !== "shaking") return;
    const t = setTimeout(() => setStage("burst"), 1400);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "burst") return;
    const t = setTimeout(() => setStage("revealing"), 900);
    return () => clearTimeout(t);
  }, [stage]);

  // Voltea la carta automáticamente al entrar
  useEffect(() => {
    if (stage !== "revealing") return;
    setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 450);
    return () => clearTimeout(t);
  }, [stage, index]);

  const current = cards[index];
  const isLast = index >= cards.length - 1;
  const aura = current ? AURA[rankOf(current)] : AURA.common;
  const isSpecial = current && RARITY_RANK[rankOf(current)] >= 3;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#05080B]">
      {/* Fondo: haz de luz + destellos */}
      <div
        className="pointer-events-none absolute inset-0 transition-[opacity,background] duration-700"
        style={{
          background: `radial-gradient(60% 45% at 50% 42%, ${aura.glow}33, transparent 70%)`,
        }}
      />
      {stage === "revealing" && isSpecial && flipped && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="pack-rays h-[150vmax] w-[150vmax] opacity-40"
            style={{
              background: `conic-gradient(from 0deg, transparent 0 8deg, ${aura.beam}55 8deg 10deg, transparent 10deg 20deg)`,
            }}
          />
        </div>
      )}

      {/* ── Sobre temblando ── */}
      {stage === "shaking" && (
        <div className="relative flex flex-1 items-center justify-center">
          <div className="pack-shake">
            <PackEnvelope glow={AURA[rankOf(best)].glow} />
          </div>
          <p className="absolute bottom-24 text-sm text-white/60">
            Abriendo sobre…
          </p>
        </div>
      )}

      {/* ── Estallido ── */}
      {stage === "burst" && (
        <div className="relative flex flex-1 items-center justify-center">
          <div
            className="pack-burst h-40 w-40 rounded-full"
            style={{ background: AURA[rankOf(best)].beam }}
          />
        </div>
      )}

      {/* ── Revelado carta a carta ── */}
      {stage === "revealing" && current && (
        <div className="relative flex flex-1 flex-col items-center justify-center px-6">
          <p className="mb-3 text-xs font-semibold tracking-widest text-white/45">
            {index + 1} / {cards.length}
          </p>

          <div className="pack-flip-scene w-48">
            <div className={cn("pack-flip", flipped && "is-flipped")}>
              {/* Dorso */}
              <div className="pack-face">
                <CardBack glow={aura.glow} />
              </div>
              {/* Frente */}
              <div className="pack-face pack-face-back">
                <div
                  className="rounded-2xl"
                  style={{
                    filter: isSpecial
                      ? `drop-shadow(0 0 22px ${aura.glow}bb)`
                      : `drop-shadow(0 0 10px ${aura.glow}66)`,
                  }}
                >
                  {isCrest(current) ? (
                    <CrestCard
                      club={current.club_name}
                      logo={current.logo_path}
                      glow={aura.glow}
                    />
                  ) : isItem(current) ? (
                    <ItemCard
                      name={current.name}
                      description={current.description}
                      kind={current.item_kind}
                      power={current.power}
                      glow={aura.glow}
                    />
                  ) : (
                    <PlayerCard
                      player={{
                        name: current.name,
                        position: current.position,
                        overall: current.overall,
                        rarity: current.rarity,
                        attributes: current.attributes,
                        gkAttributes: current.gk_attributes ?? null,
                        clubLogo: clubLogo(current.club_name),
                        nationality: current.nationality,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Datos del jugador */}
          <div
            className={cn(
              "mt-5 text-center transition-[opacity,transform] duration-500",
              flipped ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            )}
          >
            <p className={cn("text-xs font-bold tracking-widest", aura.label)}>
              {isCrest(current)
                ? "ESCUDO"
                : RARITY_LABEL[current.rarity].toUpperCase()}
            </p>
            <p className="mt-0.5 text-xl font-extrabold text-white">
              {isCrest(current) ? current.club_name : current.name}
            </p>
            {isCrest(current) ? (
              <p className="mt-1 text-xs text-white/50">
                Ya podés usarlo como escudo de tu club.
              </p>
            ) : isItem(current) ? (
              <p className="mt-1 text-xs text-white/50">{current.description}</p>
            ) : (
              <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-white/50">
                <ClubCrest club={current.club_name} size={14} showFallback={false} />
                {current.club_name ?? "—"}
              </p>
            )}
          </div>

          <div className="mt-7 w-full max-w-xs">
            <Button
              fullWidth
              size="lg"
              onClick={() => {
                if (isLast) setStage("summary");
                else setIndex((i) => i + 1);
              }}
            >
              {isLast ? "Ver resumen" : "Siguiente carta"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Resumen ── */}
      {stage === "summary" && (
        <div className="relative flex flex-1 flex-col overflow-y-auto px-5 py-8">
          <p className="eyebrow mb-1 text-center text-white/50">Sobre abierto</p>
          <h2 className="mb-5 text-center text-2xl font-extrabold text-white">
            {cards.length} jugadores nuevos
          </h2>
          <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-3">
            {cards.map((c, i) => (
              <div
                key={
                  isCrest(c)
                    ? `${c.club_name}-${i}`
                    : isItem(c)
                      ? `${c.code}-${i}`
                      : c.card_id
                }
                className="animate-fade-up"
              >
                {isCrest(c) ? (
                  <CrestCard
                    club={c.club_name}
                    logo={c.logo_path}
                    glow={AURA.rare.glow}
                  />
                ) : isItem(c) ? (
                  <ItemCard
                    name={c.name}
                    description={c.description}
                    kind={c.item_kind}
                    power={c.power}
                    glow={AURA[c.rarity].glow}
                  />
                ) : (
                  <PlayerCard
                    player={{
                      name: c.name,
                      position: c.position,
                      overall: c.overall,
                      rarity: c.rarity,
                      attributes: c.attributes,
                      gkAttributes: c.gk_attributes ?? null,
                      clubLogo: clubLogo(c.club_name),
                      nationality: c.nationality,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-7 w-full max-w-xs">
            <Button fullWidth size="lg" onClick={onClose}>
              Listo
            </Button>
          </div>
        </div>
      )}

      {/* Saltar */}
      {stage !== "summary" && (
        <button
          onClick={() => setStage("summary")}
          className="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/50 hover:text-white"
        >
          Saltar
        </button>
      )}

      <style jsx global>{`
        @keyframes packShake {
          0%, 100% { transform: rotate(0deg) scale(1); }
          20% { transform: rotate(-4deg) scale(1.03); }
          40% { transform: rotate(5deg) scale(1.05); }
          60% { transform: rotate(-6deg) scale(1.07); }
          80% { transform: rotate(6deg) scale(1.09); }
        }
        .pack-shake { animation: packShake 0.5s ease-in-out infinite; }

        @keyframes packBurst {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(9); opacity: 0; }
        }
        .pack-burst { animation: packBurst 0.9s ease-out forwards; }

        @keyframes packRays {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pack-rays { animation: packRays 14s linear infinite; }

        .pack-flip-scene { perspective: 1200px; }
        .pack-flip {
          position: relative;
          width: 100%;
          aspect-ratio: 260 / 360;
          transform-style: preserve-3d;
          transition: transform 0.75s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .pack-flip.is-flipped { transform: rotateY(180deg); }
        .pack-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .pack-face-back { transform: rotateY(180deg); }

        @media (prefers-reduced-motion: reduce) {
          .pack-shake, .pack-burst, .pack-rays { animation: none; }
          .pack-flip { transition: none; }
        }
      `}</style>
    </div>
  );
}

/** Carta de ítem, con la misma proporción que la de jugador. */
function ItemCard({
  name,
  description,
  kind,
  power,
  glow,
}: {
  name: string;
  description: string;
  kind: "heal" | "stamina";
  power: number;
  glow: string;
}) {
  return (
    <div
      className="flex aspect-[260/360] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 text-center"
      style={{
        borderColor: glow,
        background: `linear-gradient(160deg, ${glow}33, #0A0F14)`,
      }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `${glow}33`, color: glow }}
      >
        {kind === "heal" ? <HeartPulse size={30} /> : <Package size={30} />}
      </div>
      <p className="font-display text-base font-extrabold leading-tight text-white">
        {name}
      </p>
      <p className="text-[11px] leading-snug text-white/60">{description}</p>
      <p
        className="font-display text-2xl font-extrabold"
        style={{ color: glow }}
      >
        {kind === "heal" ? `${power} part.` : `+${power}`}
      </p>
    </div>
  );
}

/** Carta de escudo, con la misma proporción que la de jugador. */
function CrestCard({
  club,
  logo,
  glow,
}: {
  club: string;
  logo: string;
  glow: string;
}) {
  return (
    <div
      className="flex aspect-[260/360] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 text-center"
      style={{
        borderColor: glow,
        background: `linear-gradient(160deg, ${glow}33, #0A0F14)`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt={`Escudo de ${club}`}
        className="h-2/5 w-3/5 object-contain"
        loading="lazy"
      />
      <div className="flex items-center gap-1.5" style={{ color: glow }}>
        <Shield size={14} />
        <span className="text-[11px] font-bold uppercase tracking-widest">
          Escudo
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-extrabold leading-tight text-white">
        {club}
      </p>
    </div>
  );
}

function PackEnvelope({ glow }: { glow: string }) {
  return (
    <svg width="150" height="200" viewBox="0 0 150 200">
      <defs>
        <linearGradient id="env" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={glow} stopOpacity="0.95" />
          <stop offset="1" stopColor="#0A0F14" />
        </linearGradient>
      </defs>
      <rect
        x="10"
        y="10"
        width="130"
        height="180"
        rx="12"
        fill="url(#env)"
        stroke={glow}
        strokeWidth="2"
      />
      <path
        d="M10 22 L75 78 L140 22"
        fill="none"
        stroke={glow}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx="75" cy="118" r="26" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
      <path
        d="M75 104 l4 9 10 1 -7 7 2 10 -9 -5 -9 5 2 -10 -7 -7 10 -1 z"
        fill="#fff"
        fillOpacity="0.75"
      />
    </svg>
  );
}

function CardBack({ glow }: { glow: string }) {
  return (
    <svg viewBox="0 0 260 360" className="h-full w-full">
      <defs>
        <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16222B" />
          <stop offset="1" stopColor="#0A0F14" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="248" height="348" rx="20" fill="url(#back)" stroke={glow} strokeWidth="2" />
      <circle cx="130" cy="180" r="54" fill="none" stroke={glow} strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="130" cy="180" r="34" fill="none" stroke={glow} strokeOpacity="0.3" strokeWidth="2" />
      <path
        d="M130 152 l7 15 17 2 -12 12 3 17 -15 -8 -15 8 3 -17 -12 -12 17 -2 z"
        fill={glow}
        fillOpacity="0.6"
      />
    </svg>
  );
}
