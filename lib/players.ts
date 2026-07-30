// Tipos y constantes de dominio para jugadores/cartas (Fase 2).

export const POSITIONS = [
  "GK",
  "CB",
  "RB",
  "LB",
  "RWB",
  "LWB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "CF",
  "ST",
] as const;
export type Position = (typeof POSITIONS)[number];

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "icon",
] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Común",
  uncommon: "Poco común",
  rare: "Raro",
  epic: "Épico",
  legendary: "Legendario",
  icon: "Icono",
};

export const POSITION_GROUP: Record<Position, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK",
  CB: "DEF",
  RB: "DEF",
  LB: "DEF",
  RWB: "DEF",
  LWB: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  RM: "MID",
  LM: "MID",
  RW: "ATT",
  LW: "ATT",
  CF: "ATT",
  ST: "ATT",
};

export type Attributes = {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  physical: number;
  dribbling: number;
};

export const ATTR_KEYS: (keyof Attributes)[] = [
  "pace",
  "shooting",
  "passing",
  "defending",
  "physical",
  "dribbling",
];

// Etiquetas cortas estilo "cara de carta" (PAC/TIR/PAS/REG/DEF/FIS)
export const ATTR_SHORT: Record<keyof Attributes, string> = {
  pace: "RIT",
  shooting: "TIR",
  passing: "PAS",
  dribbling: "REG",
  defending: "DEF",
  physical: "FÍS",
};

export const ATTR_LABEL: Record<keyof Attributes, string> = {
  pace: "Ritmo",
  shooting: "Tiro",
  passing: "Pase",
  dribbling: "Regate",
  defending: "Defensa",
  physical: "Físico",
};

export type GkAttributes = {
  diving?: number;
  handling?: number;
  kicking?: number;
  positioning?: number;
  reflexes?: number;
  speed?: number;
};

export const GK_LABEL: Record<keyof GkAttributes, string> = {
  diving: "Estirada",
  handling: "Blocaje",
  kicking: "Saque",
  positioning: "Colocación",
  reflexes: "Reflejos",
  speed: "Velocidad",
};

// Atributos detallados tal cual vienen del CSV.
export type DetailAttributes = Record<string, number>;

export const DETAIL_GROUPS: {
  title: string;
  keys: { key: string; label: string }[];
}[] = [
  {
    title: "Ataque",
    keys: [
      { key: "attacking_crossing", label: "Centros" },
      { key: "attacking_finishing", label: "Definición" },
      { key: "attacking_heading_accuracy", label: "Cabeceo" },
      { key: "attacking_short_passing", label: "Pase corto" },
      { key: "attacking_volleys", label: "Voleas" },
    ],
  },
  {
    title: "Habilidad",
    keys: [
      { key: "skill_dribbling", label: "Regate" },
      { key: "skill_curve", label: "Efecto" },
      { key: "skill_fk_accuracy", label: "Tiros libres" },
      { key: "skill_long_passing", label: "Pase largo" },
      { key: "skill_ball_control", label: "Control" },
    ],
  },
  {
    title: "Movimiento",
    keys: [
      { key: "movement_acceleration", label: "Aceleración" },
      { key: "movement_sprint_speed", label: "Velocidad" },
      { key: "movement_agility", label: "Agilidad" },
      { key: "movement_reactions", label: "Reacción" },
      { key: "movement_balance", label: "Equilibrio" },
    ],
  },
  {
    title: "Potencia",
    keys: [
      { key: "power_shot_power", label: "Potencia tiro" },
      { key: "power_jumping", label: "Salto" },
      { key: "power_stamina", label: "Resistencia" },
      { key: "power_strength", label: "Fuerza" },
      { key: "power_long_shots", label: "Tiro lejano" },
    ],
  },
  {
    title: "Mentalidad",
    keys: [
      { key: "mentality_aggression", label: "Agresividad" },
      { key: "mentality_interceptions", label: "Intercepciones" },
      { key: "mentality_positioning", label: "Posicionamiento" },
      { key: "mentality_vision", label: "Visión" },
      { key: "mentality_penalties", label: "Penales" },
      { key: "mentality_composure", label: "Serenidad" },
    ],
  },
  {
    title: "Defensa",
    keys: [
      { key: "defending_marking_awareness", label: "Marcaje" },
      { key: "defending_standing_tackle", label: "Entrada" },
      { key: "defending_sliding_tackle", label: "Barrida" },
    ],
  },
];

export type CatalogPlayer = {
  id: string; // template id
  identity_id: string;
  name: string;
  nationality: string | null;
  position: Position;
  version: string;
  rarity: Rarity;
  overall: number;
  potential: number;
  age: number;
  personality: string;
  attributes: Attributes;
  is_tradeable: boolean;
  art_portrait: string | null;
  // Datos reales del CSV
  positions?: Position[] | null;
  gk_attributes?: GkAttributes | null;
  detail?: DetailAttributes | null;
  long_name?: string | null;
  dob?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  club_name?: string | null;
  league_name?: string | null;
  preferred_foot?: string | null;
  weak_foot?: number | null;
  skill_moves?: number | null;
  work_rate?: string | null;
  international_reputation?: number | null;
  player_traits?: string | null;
  value_eur?: number | null;
};

// ---------- Compatibilidad de posiciones (química / rating) ----------
export const POSITION_COMPAT: Record<Position, Position[]> = {
  GK: [],
  CB: ["RB", "LB", "CDM"],
  RB: ["RWB", "CB", "RM", "RW"],
  LB: ["LWB", "CB", "LM", "LW"],
  RWB: ["RB", "RM", "RW"],
  LWB: ["LB", "LM", "LW"],
  CDM: ["CM", "CB"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "CF", "RW", "LW", "ST"],
  RM: ["RW", "CM", "RB", "RWB"],
  LM: ["LW", "CM", "LB", "LWB"],
  RW: ["RM", "CAM", "CF", "ST"],
  LW: ["LM", "CAM", "CF", "ST"],
  CF: ["ST", "CAM", "RW", "LW"],
  ST: ["CF", "CAM", "RW", "LW"],
};

export type Fit = "exact" | "compatible" | "group" | "none";

export function positionFit(cardPos: Position, slotPos: Position): Fit {
  if (cardPos === slotPos) return "exact";
  if (POSITION_COMPAT[slotPos]?.includes(cardPos)) return "compatible";
  if (POSITION_GROUP[cardPos] === POSITION_GROUP[slotPos]) return "group";
  return "none";
}

// Carta que posee un usuario, aplanada con datos de plantilla (para UI/sim).
export type OwnedCard = {
  id: string;
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  attributes: Attributes;
  positions?: Position[] | null;
  gkAttributes?: GkAttributes | null;
  clubName?: string | null;
  leagueName?: string | null;
  nationality?: string | null;
  stamina?: number;
  injuryType?: string | null;
  injuryMatches?: number;
};
