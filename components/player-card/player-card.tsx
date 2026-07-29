import { memo } from "react";
import { faceElements } from "./avatar";
import {
  ATTR_SHORT,
  RARITY_LABEL,
  type Attributes,
  type GkAttributes,
  type Position,
  type Rarity,
} from "@/lib/players";

// Etiquetas de portero (cara de carta)
const GK_SHORT: { key: keyof GkAttributes; label: string }[] = [
  { key: "diving", label: "EST" },
  { key: "handling", label: "BLO" },
  { key: "kicking", label: "SAQ" },
  { key: "reflexes", label: "REF" },
  { key: "speed", label: "VEL" },
  { key: "positioning", label: "COL" },
];

// Paleta por rareza: degradado de fondo + color de texto sobre la carta.
const RARITY_THEME: Record<
  Rarity,
  { from: string; to: string; ink: string; sub: string; glow: string }
> = {
  common:    { from: "#8a5a2b", to: "#5b3a1c", ink: "#f3e2c7", sub: "#e6cfa8", glow: "#c98a4a" },
  uncommon:  { from: "#aab7c2", to: "#6f7d89", ink: "#0d1418", sub: "#20303a", glow: "#cfdae2" },
  rare:      { from: "#ecc65e", to: "#a9812f", ink: "#2e2205", sub: "#5a4410", glow: "#f6d976" },
  epic:      { from: "#6f86ff", to: "#2b348f", ink: "#eef1ff", sub: "#c3ccff", glow: "#8ea0ff" },
  legendary: { from: "#ff5b6e", to: "#7a1220", ink: "#ffe9ec", sub: "#ffc3cb", glow: "#ff7d8c" },
  icon:      { from: "#f6e7b3", to: "#caa64a", ink: "#3a2f10", sub: "#6a561f", glow: "#fff0c0" },
};

export type PlayerCardData = {
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  attributes: Attributes;
  nationality?: string | null;
  /** Si viene y es portero, la carta muestra stats de portería. */
  gkAttributes?: GkAttributes | null;
  /** Ruta del escudo, para dibujarlo en la carta. */
  clubLogo?: string | null;
};

function PlayerCardBase({
  player,
  width,
  className,
}: {
  player: PlayerCardData;
  width?: number;
  className?: string;
}) {
  const t = RARITY_THEME[player.rarity];
  const gid = `grad-${player.rarity}`;
  const cid = `clip-${player.rarity}`;

  // Portero con stats propias -> cara de portero. Resto -> 6 atributos.
  const gk = player.gkAttributes;
  const isKeeper =
    player.position === "GK" && !!gk && (gk.diving != null || gk.reflexes != null);

  const stats: (keyof Attributes)[] = [
    "pace",
    "shooting",
    "passing",
    "dribbling",
    "defending",
    "physical",
  ];

  const cells: { value: number; label: string }[] = isKeeper
    ? GK_SHORT.map((g) => ({ value: gk![g.key] ?? 0, label: g.label }))
    : stats.map((k) => ({ value: player.attributes[k], label: ATTR_SHORT[k] }));

  const displayName =
    player.name.length > 18 ? player.name.split(" ").slice(-1)[0] : player.name;

  return (
    <svg
      viewBox="0 0 260 360"
      className={className}
      style={{
        width: width ? `${width}px` : "100%",
        height: "auto",
        display: "block",
      }}
      role="img"
      aria-label={`${player.name}, ${player.position}, media ${player.overall}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
        <clipPath id={cid}>
          <path d="M20 8 h220 a12 12 0 0 1 12 12 v300 a40 40 0 0 1 -40 40 h-176 a40 40 0 0 1 -40 -40 v-300 a12 12 0 0 1 12 -12 z" />
        </clipPath>
      </defs>

      {/* Cuerpo de la carta */}
      <path
        d="M20 8 h220 a12 12 0 0 1 12 12 v300 a40 40 0 0 1 -40 40 h-176 a40 40 0 0 1 -40 -40 v-300 a12 12 0 0 1 12 -12 z"
        fill={`url(#${gid})`}
        stroke={t.glow}
        strokeWidth="1.5"
      />

      <g clipPath={`url(#${cid})`}>
        {/* Rostro generado a partir del nombre (determinista) */}
        <g
          opacity="0.96"
          dangerouslySetInnerHTML={{
            __html: faceElements(player.name, 162, 128, 52),
          }}
        />

        {/* Bloque superior izquierdo: media + posición */}
        <text x="30" y="70" fontFamily="Archivo, sans-serif" fontSize="46" fontWeight="800" fill={t.ink}>
          {player.overall}
        </text>
        <text x="33" y="92" fontFamily="Archivo, sans-serif" fontSize="18" fontWeight="700" fill={t.ink}>
          {player.position}
        </text>
        <rect x="30" y="102" width="34" height="2" fill={t.ink} opacity="0.5" />
        <text x="30" y="122" fontFamily="Manrope, sans-serif" fontSize="11" fontWeight="700" fill={t.sub} letterSpacing="1.2">
          {RARITY_LABEL[player.rarity].toUpperCase()}
        </text>

        {/* Escudo del club */}
        {player.clubLogo && (
          <image
            href={player.clubLogo}
            x="34"
            y="150"
            width="34"
            height="34"
            preserveAspectRatio="xMidYMid meet"
            opacity="0.95"
          />
        )}

        {/* Panel inferior para nombre + stats (legibilidad) */}
        <rect x="20" y="232" width="220" height="128" fill="#000000" opacity="0.16" />

        {/* Nombre */}
        <text
          x="130"
          y="258"
          textAnchor="middle"
          fontFamily="Archivo, sans-serif"
          fontSize="20"
          fontWeight="800"
          fill={t.ink}
          letterSpacing="0.5"
        >
          {displayName.toUpperCase()}
        </text>
        <line x1="40" y1="270" x2="220" y2="270" stroke={t.ink} strokeWidth="1" opacity="0.35" />

        {/* Stats 3x2 */}
        {cells.map((c, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 60 + col * 70;
          const y = 300 + row * 34;
          return (
            <g key={c.label} textAnchor="middle">
              <text
                x={x}
                y={y}
                fontFamily="Archivo, sans-serif"
                fontSize="19"
                fontWeight="800"
                fill={t.ink}
              >
                {c.value}
              </text>
              <text
                x={x}
                y={y + 13}
                fontFamily="Manrope, sans-serif"
                fontSize="9"
                fontWeight="700"
                fill={t.sub}
                letterSpacing="0.5"
              >
                {c.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Memoizada: en el catálogo se renderizan decenas a la vez y el SVG del
 * rostro es costoso. Solo se recalcula si cambian los datos del jugador.
 */
export const PlayerCard = memo(PlayerCardBase, (a, b) => {
  const x = a.player, y = b.player;
  return (
    a.width === b.width &&
    a.className === b.className &&
    x.name === y.name &&
    x.overall === y.overall &&
    x.rarity === y.rarity &&
    x.position === y.position &&
    x.clubLogo === y.clubLogo
  );
});
