import type { Position } from "./players";

// Slot en el campo: código único, posición (para química/rating) y
// coordenadas en % sobre el campo (x: izq->der, y: arriba=ataque).
export type FormationSlot = {
  code: string;
  pos: Position;
  x: number;
  y: number;
};

export const FORMATIONS: Record<string, FormationSlot[]> = {
  "4-3-3": [
    { code: "GK", pos: "GK", x: 50, y: 93 },
    { code: "LB", pos: "LB", x: 14, y: 73 },
    { code: "LCB", pos: "CB", x: 37, y: 75 },
    { code: "RCB", pos: "CB", x: 63, y: 75 },
    { code: "RB", pos: "RB", x: 86, y: 73 },
    { code: "LCM", pos: "CM", x: 30, y: 52 },
    { code: "CM", pos: "CM", x: 50, y: 56 },
    { code: "RCM", pos: "CM", x: 70, y: 52 },
    { code: "LW", pos: "LW", x: 20, y: 24 },
    { code: "ST", pos: "ST", x: 50, y: 16 },
    { code: "RW", pos: "RW", x: 80, y: 24 },
  ],
  "4-4-2": [
    { code: "GK", pos: "GK", x: 50, y: 93 },
    { code: "LB", pos: "LB", x: 14, y: 73 },
    { code: "LCB", pos: "CB", x: 37, y: 75 },
    { code: "RCB", pos: "CB", x: 63, y: 75 },
    { code: "RB", pos: "RB", x: 86, y: 73 },
    { code: "LM", pos: "LM", x: 16, y: 48 },
    { code: "LCM", pos: "CM", x: 40, y: 52 },
    { code: "RCM", pos: "CM", x: 60, y: 52 },
    { code: "RM", pos: "RM", x: 84, y: 48 },
    { code: "LST", pos: "ST", x: 38, y: 18 },
    { code: "RST", pos: "ST", x: 62, y: 18 },
  ],
  "4-2-3-1": [
    { code: "GK", pos: "GK", x: 50, y: 93 },
    { code: "LB", pos: "LB", x: 14, y: 73 },
    { code: "LCB", pos: "CB", x: 37, y: 75 },
    { code: "RCB", pos: "CB", x: 63, y: 75 },
    { code: "RB", pos: "RB", x: 86, y: 73 },
    { code: "LDM", pos: "CDM", x: 38, y: 58 },
    { code: "RDM", pos: "CDM", x: 62, y: 58 },
    { code: "LAM", pos: "CAM", x: 22, y: 36 },
    { code: "CAM", pos: "CAM", x: 50, y: 38 },
    { code: "RAM", pos: "CAM", x: 78, y: 36 },
    { code: "ST", pos: "ST", x: 50, y: 15 },
  ],
  "3-5-2": [
    { code: "GK", pos: "GK", x: 50, y: 93 },
    { code: "LCB", pos: "CB", x: 28, y: 75 },
    { code: "CB", pos: "CB", x: 50, y: 73 },
    { code: "RCB", pos: "CB", x: 72, y: 75 },
    { code: "LM", pos: "LM", x: 11, y: 48 },
    { code: "LCM", pos: "CM", x: 31, y: 56 },
    { code: "CM", pos: "CM", x: 50, y: 52 },
    { code: "RCM", pos: "CM", x: 69, y: 56 },
    { code: "RM", pos: "RM", x: 89, y: 48 },
    { code: "LST", pos: "ST", x: 40, y: 18 },
    { code: "RST", pos: "ST", x: 62, y: 18 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

export const BENCH_SLOTS = [
  "SUB1",
  "SUB2",
  "SUB3",
  "SUB4",
  "SUB5",
  "SUB6",
  "SUB7",
] as const;

// ---------- Táctica ----------
export type Tactics = {
  mentality: "defensive" | "balanced" | "offensive";
  press: "low" | "medium" | "high";
  tempo: "slow" | "medium" | "fast";
  width: "narrow" | "medium" | "wide";
  passing: "short" | "mixed" | "direct";
};

export const DEFAULT_TACTICS: Tactics = {
  mentality: "balanced",
  press: "medium",
  tempo: "medium",
  width: "medium",
  passing: "mixed",
};

export const TACTIC_OPTIONS: Record<
  keyof Tactics,
  { label: string; options: { value: string; label: string }[] }
> = {
  mentality: {
    label: "Mentalidad",
    options: [
      { value: "defensive", label: "Defensiva" },
      { value: "balanced", label: "Equilibrada" },
      { value: "offensive", label: "Ofensiva" },
    ],
  },
  press: {
    label: "Presión",
    options: [
      { value: "low", label: "Baja" },
      { value: "medium", label: "Media" },
      { value: "high", label: "Alta" },
    ],
  },
  tempo: {
    label: "Ritmo",
    options: [
      { value: "slow", label: "Lento" },
      { value: "medium", label: "Medio" },
      { value: "fast", label: "Rápido" },
    ],
  },
  width: {
    label: "Amplitud",
    options: [
      { value: "narrow", label: "Estrecha" },
      { value: "medium", label: "Media" },
      { value: "wide", label: "Ancha" },
    ],
  },
  passing: {
    label: "Pase",
    options: [
      { value: "short", label: "Corto" },
      { value: "mixed", label: "Mixto" },
      { value: "direct", label: "Directo" },
    ],
  },
};

export function isValidFormation(f: string): boolean {
  return f in FORMATIONS;
}

export function validTactics(t: Partial<Tactics>): Tactics {
  const pickOpt = <K extends keyof Tactics>(k: K): Tactics[K] => {
    const allowed = TACTIC_OPTIONS[k].options.map((o) => o.value);
    return (
      allowed.includes(t[k] as string) ? t[k] : DEFAULT_TACTICS[k]
    ) as Tactics[K];
  };
  return {
    mentality: pickOpt("mentality"),
    press: pickOpt("press"),
    tempo: pickOpt("tempo"),
    width: pickOpt("width"),
    passing: pickOpt("passing"),
  };
}
