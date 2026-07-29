// Cálculo de media (overall) ponderada por posición y rareza por bandas.
// Regla del proyecto: el overall SIEMPRE se deriva de los atributos.
import type { Attributes, Position, Rarity } from "./players";

// Pesos por posición sobre [pace, shooting, passing, defending, physical, dribbling].
// Cada fila suma ~1.0. El portero reinterpreta "defending" como portería.
export const POSITION_WEIGHTS: Record<Position, Attributes> = {
  GK:  { pace: 0.10, shooting: 0.00, passing: 0.10, defending: 0.50, physical: 0.30, dribbling: 0.00 },
  CB:  { pace: 0.12, shooting: 0.05, passing: 0.10, defending: 0.38, physical: 0.30, dribbling: 0.05 },
  RB:  { pace: 0.22, shooting: 0.06, passing: 0.16, defending: 0.26, physical: 0.16, dribbling: 0.14 },
  LB:  { pace: 0.22, shooting: 0.06, passing: 0.16, defending: 0.26, physical: 0.16, dribbling: 0.14 },
  RWB: { pace: 0.26, shooting: 0.07, passing: 0.18, defending: 0.20, physical: 0.14, dribbling: 0.15 },
  LWB: { pace: 0.26, shooting: 0.07, passing: 0.18, defending: 0.20, physical: 0.14, dribbling: 0.15 },
  CDM: { pace: 0.10, shooting: 0.06, passing: 0.24, defending: 0.28, physical: 0.20, dribbling: 0.12 },
  CM:  { pace: 0.10, shooting: 0.14, passing: 0.28, defending: 0.16, physical: 0.14, dribbling: 0.18 },
  CAM: { pace: 0.12, shooting: 0.20, passing: 0.26, defending: 0.06, physical: 0.10, dribbling: 0.26 },
  RM:  { pace: 0.22, shooting: 0.16, passing: 0.20, defending: 0.10, physical: 0.10, dribbling: 0.22 },
  LM:  { pace: 0.22, shooting: 0.16, passing: 0.20, defending: 0.10, physical: 0.10, dribbling: 0.22 },
  RW:  { pace: 0.24, shooting: 0.20, passing: 0.16, defending: 0.05, physical: 0.09, dribbling: 0.26 },
  LW:  { pace: 0.24, shooting: 0.20, passing: 0.16, defending: 0.05, physical: 0.09, dribbling: 0.26 },
  CF:  { pace: 0.18, shooting: 0.28, passing: 0.14, defending: 0.04, physical: 0.13, dribbling: 0.23 },
  ST:  { pace: 0.22, shooting: 0.32, passing: 0.08, defending: 0.04, physical: 0.16, dribbling: 0.18 },
};

export function computeOverall(attrs: Attributes, position: Position): number {
  const w = POSITION_WEIGHTS[position];
  const sum =
    attrs.pace * w.pace +
    attrs.shooting * w.shooting +
    attrs.passing * w.passing +
    attrs.defending * w.defending +
    attrs.physical * w.physical +
    attrs.dribbling * w.dribbling;
  return Math.round(sum);
}

// Debe coincidir con public._rarity_from_overall() en la base de datos.
// Bandas calibradas sobre la distribución real del dataset (47-93).
export function rarityFromOverall(overall: number): Rarity {
  if (overall >= 89) return "icon";
  if (overall >= 84) return "legendary";
  if (overall >= 78) return "epic";
  if (overall >= 72) return "rare";
  if (overall >= 65) return "uncommon";
  return "common";
}
