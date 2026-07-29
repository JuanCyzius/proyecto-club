import { positionFit, type Position } from "./players";

// ============================================================
// QUÍMICA — estilo FIFA, adaptada.
//
// Cada titular tiene 0-10 de química, que sale de dos partes:
//   1. AJUSTE DE POSICIÓN (0-4): jugar en tu puesto natural.
//   2. VÍNCULOS (0-6): compartir club, liga o nacionalidad con el
//      resto del once. Cuantos más compañeros afines, más química.
//
// Peso de cada vínculo (por compañero compartido):
//   mismo club    → 3 puntos (el más fuerte)
//   misma nación  → 1,5 puntos
//   misma liga    → 1 punto
//
// La química de equipo es la media, de 0 a 100.
// ============================================================

export type ChemPlayer = {
  cardPos: Position;
  slotPos: Position;
  club?: string | null;
  league?: string | null;
  nation?: string | null;
};

export type ChemBreakdown = {
  total: number;    // 0-10
  position: number; // 0-4
  links: number;    // 0-6
  sameClub: number;
  sameLeague: number;
  sameNation: number;
};

const POSITION_POINTS: Record<string, number> = {
  exact: 4,
  compatible: 3,
  group: 1.5,
  none: 0,
};

const LINK_CLUB = 3;
const LINK_NATION = 1.5;
const LINK_LEAGUE = 1;
const MAX_LINKS = 6;

const norm = (v?: string | null) => (v ? v.trim().toLowerCase() : null);

/** Química detallada de un jugador respecto al resto del once. */
export function playerChemistry(
  player: ChemPlayer,
  squad: ChemPlayer[]
): ChemBreakdown {
  const position = POSITION_POINTS[positionFit(player.cardPos, player.slotPos)];

  const club = norm(player.club);
  const league = norm(player.league);
  const nation = norm(player.nation);

  let sameClub = 0;
  let sameLeague = 0;
  let sameNation = 0;

  for (const mate of squad) {
    if (mate === player) continue;
    if (club && norm(mate.club) === club) sameClub++;
    if (nation && norm(mate.nation) === nation) sameNation++;
    // La liga solo suma si NO comparten club (evita contar doble)
    if (league && norm(mate.league) === league && norm(mate.club) !== club)
      sameLeague++;
  }

  const rawLinks =
    sameClub * LINK_CLUB + sameNation * LINK_NATION + sameLeague * LINK_LEAGUE;
  const links = Math.min(MAX_LINKS, rawLinks);

  // Un jugador totalmente fuera de posición no aprovecha sus vínculos.
  const positionFactor = position === 0 ? 0.4 : 1;

  return {
    total: Math.min(10, Math.round((position + links * positionFactor) * 10) / 10),
    position,
    links: Math.round(links * 10) / 10,
    sameClub,
    sameLeague,
    sameNation,
  };
}

/** Química de equipo 0-100 (media de los titulares colocados). */
export function teamChemistry(squad: ChemPlayer[]): number {
  if (squad.length === 0) return 0;
  const total = squad.reduce(
    (sum, p) => sum + playerChemistry(p, squad).total,
    0
  );
  return Math.round((total / (squad.length * 10)) * 100);
}

/** Etiqueta y color de la química de un jugador (para la interfaz). */
export function chemTier(total: number): {
  label: string;
  color: string;
  ring: string;
} {
  if (total >= 8.5)
    return { label: "Excelente", color: "text-turf", ring: "ring-turf" };
  if (total >= 6.5)
    return { label: "Buena", color: "text-turf/80", ring: "ring-turf/60" };
  if (total >= 4)
    return { label: "Normal", color: "text-trophy", ring: "ring-trophy/70" };
  if (total >= 2)
    return { label: "Baja", color: "text-orange-400", ring: "ring-orange-400/70" };
  return { label: "Mala", color: "text-danger", ring: "ring-danger/70" };
}

/** Compatibilidad con código anterior (solo posición). */
export function playerChem(cardPos: Position, slotPos: Position): number {
  return POSITION_POINTS[positionFit(cardPos, slotPos)] * 2.5;
}
