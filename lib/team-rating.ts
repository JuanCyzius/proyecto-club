import { positionFit, type Fit, type Position } from "./players";

// Un jugador fuera de posición rinde menos.
const FIT_FACTOR: Record<Fit, number> = {
  exact: 1.0,
  compatible: 0.92,
  group: 0.82,
  none: 0.65,
};

export function effectiveRating(
  overall: number,
  cardPos: Position,
  slotPos: Position
): number {
  return overall * FIT_FACTOR[positionFit(cardPos, slotPos)];
}

// Media del equipo = media de los ratings efectivos de los titulares.
export function teamRating(
  starters: { overall: number; cardPos: Position; slotPos: Position }[]
): number {
  if (starters.length === 0) return 0;
  const total = starters.reduce(
    (s, p) => s + effectiveRating(p.overall, p.cardPos, p.slotPos),
    0
  );
  return Math.round(total / starters.length);
}
