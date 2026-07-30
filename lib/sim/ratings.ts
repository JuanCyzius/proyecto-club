import { POSITION_GROUP, positionFit, type Attributes } from "../players";
import type { SimPlayer, SimTeam, Units } from "./types";

const FIT_FACTOR: Record<string, number> = {
  exact: 1.0,
  compatible: 0.92,
  group: 0.82,
  none: 0.65,
};

function eff(p: SimPlayer, key: keyof Attributes): number {
  const f = FIT_FACTOR[positionFit(p.position, p.slotPos)];
  return p.attributes[key] * f;
}

function avg(nums: number[], fallback: number): number {
  if (nums.length === 0) return fallback;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Ratings de unidad (0..100) a partir de los titulares, ajustados por
// táctica y ventaja de local. Regla: derivado de atributos + posición.
export function computeUnits(team: SimTeam, isHome: boolean): Units {
  const overallAvg = avg(
    team.starters.map((p) => p.overall),
    65
  );

  const byGroup = (g: "GK" | "DEF" | "MID" | "ATT") =>
    team.starters.filter((p) => POSITION_GROUP[p.slotPos] === g);

  const gks = byGroup("GK");
  const defs = byGroup("DEF");
  const mids = byGroup("MID");
  const atts = byGroup("ATT");
  const defAndDm = [...defs, ...mids.filter((p) => p.slotPos === "CDM")];

  // Portería: si la carta trae stats reales de portero, se usan esos.
  // Si no (jugador de campo puesto al arco), se degrada su rating.
  const gk = avg(
    gks.map((p) => {
      const g = p.gkAttributes;
      if (g && (g.diving || g.reflexes || g.positioning)) {
        const diving = g.diving ?? 50;
        const reflexes = g.reflexes ?? 50;
        const positioning = g.positioning ?? 50;
        const handling = g.handling ?? 50;
        const base =
          0.3 * reflexes + 0.28 * diving + 0.24 * positioning + 0.18 * handling;
        // Penalización si no es portero de oficio
        return p.position === "GK" ? base : base * 0.7;
      }
      return 0.85 * eff(p, "defending") + 0.15 * eff(p, "physical");
    }),
    overallAvg - 4
  );

  let defense = avg(
    [...defAndDm, ...gks].map(
      (p) =>
        0.5 * eff(p, "defending") +
        0.3 * eff(p, "physical") +
        0.2 * eff(p, "pace")
    ),
    overallAvg
  );

  let midfield = avg(
    mids.map(
      (p) =>
        0.4 * eff(p, "passing") +
        0.25 * eff(p, "dribbling") +
        0.2 * eff(p, "physical") +
        0.15 * eff(p, "defending")
    ),
    overallAvg
  );

  const attGroup = [
    ...atts,
    ...mids.filter((p) => p.slotPos === "CAM"),
  ];
  let attack = avg(
    attGroup.map(
      (p) =>
        0.3 * eff(p, "dribbling") +
        0.25 * eff(p, "pace") +
        0.25 * eff(p, "passing") +
        0.2 * eff(p, "shooting")
    ),
    overallAvg
  );

  const finishing = avg(
    attGroup.map((p) => 0.6 * eff(p, "shooting") + 0.4 * eff(p, "dribbling")),
    overallAvg - 2
  );

  // Táctica
  const t = team.tactics;
  if (t.mentality === "offensive") {
    attack *= 1.08;
    defense *= 0.93;
  } else if (t.mentality === "defensive") {
    attack *= 0.92;
    defense *= 1.08;
  }
  if (t.press === "high") {
    midfield *= 1.05;
    defense *= 0.98;
  } else if (t.press === "low") {
    midfield *= 0.96;
    defense *= 1.03;
  }

  // Ventaja de local: se aplica FUERA del amplificador de brecha
  // (ver amplifyUnitGap), para que no se infle artificialmente.
  const u: Units = { attack, midfield, defense, finishing, gk };
  return isHome ? applyHomeAdvantage(u) : u;
}

export function applyHomeAdvantage(u: Units): Units {
  return {
    ...u,
    attack: u.attack * 1.04,
    defense: u.defense * 1.03,
    midfield: u.midfield * 1.02,
  };
}

export function tempoMultiplier(a: SimTeam, b: SimTeam): number {
  const score = (t: SimTeam) =>
    t.tactics.tempo === "fast" ? 1.15 : t.tactics.tempo === "slow" ? 0.88 : 1;
  return (score(a) + score(b)) / 2;
}

// ------------------------------------------------------------
// Amplificador de brecha: la media general pesa MUCHO.
//
// El motor original era muy plano: un equipo de 72 empataba seguido
// contra uno de 80. Esto separa a los dos equipos según su distancia
// real en cada unidad: con brecha 0 no cambia nada; a +4 de media el
// mejor ya domina; a +6 o más es prácticamente imposible ganarle.
// Calibrado por simulación (ver tests/sim/run-tests.ts).
// ------------------------------------------------------------
const GAP_AMP = 3.2;

export function amplifyUnitGap(a: Units, b: Units): [Units, Units] {
  const keys: (keyof Units)[] = [
    "attack",
    "midfield",
    "defense",
    "finishing",
    "gk",
  ];
  const outA = { ...a };
  const outB = { ...b };
  for (const k of keys) {
    const mean = (a[k] + b[k]) / 2;
    outA[k] = Math.max(1, mean + (a[k] - mean) * GAP_AMP);
    outB[k] = Math.max(1, mean + (b[k] - mean) * GAP_AMP);
  }
  return [outA, outB];
}
