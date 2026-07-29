import { POSITION_GROUP, positionFit, type Position } from "../players";
import { clamp } from "./rng";
import type {
  MatchEvent,
  Side,
  SimPlayer,
  SimTeam,
  TeamStats,
  Units,
} from "./types";

export type TeamState = {
  side: Side;
  team: SimTeam;
  units: Units;
  onPitch: SimPlayer[];
  benchLeft: SimPlayer[];
  subs: number;
  stats: TeamStats;
  goalsBy: Record<string, number>;
};

export type MatchState = {
  home: TeamState;
  away: TeamState;
  score: [number, number];
  events: MatchEvent[];
  rng: () => number;
  minute: number;
  fatigue: number;
  possHome: number;
  momentum: number; // + favorece a home, - a away
};

const CHANCE_BASE = 0.11;

function emptyStats(): TeamStats {
  return {
    chances: 0,
    shots: 0,
    goals: 0,
    fouls: 0,
    yellow: 0,
    red: 0,
    possession: 50,
  };
}

export function makeTeamState(
  side: Side,
  team: SimTeam,
  units: Units
): TeamState {
  return {
    side,
    team,
    units,
    onPitch: [...team.starters],
    benchLeft: [...team.bench],
    subs: 0,
    stats: emptyStats(),
    goalsBy: {},
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(
  rng: () => number,
  players: SimPlayer[],
  weight: (p: SimPlayer) => number
): SimPlayer {
  const weights = players.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(rng, players);
  let r = rng() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}

// Peso ofensivo de un jugador para elegir rematador/protagonista.
function attackWeight(p: SimPlayer): number {
  const g = POSITION_GROUP[p.slotPos];
  const mult = g === "ATT" ? 1.6 : g === "MID" ? 0.8 : g === "DEF" ? 0.2 : 0.02;
  return (p.attributes.shooting + p.attributes.dribbling) * mult + 1;
}

const CHANCE_TEXT = [
  "se asoma con peligro",
  "combina y llega al área",
  "arma una jugada por la banda",
  "prueba desde la frontal",
  "genera una ocasión",
];
const OFF_TARGET = [
  "pero el remate se va desviado.",
  "pero la manda por encima del travesaño.",
  "y el disparo sale muy cruzado.",
];
const SAVED = [
  "¡y el arquero responde!",
  "pero ataja el guardameta.",
  "y la figura bajo los palos la saca.",
];

function possShareFor(s: MatchState, atk: TeamState): number {
  return atk.side === "home" ? s.possHome : 1 - s.possHome;
}

export function attemptChance(
  s: MatchState,
  atk: TeamState,
  def: TeamState
): void {
  atk.stats.chances++;
  const hero = pickWeighted(s.rng, atk.onPitch, attackWeight);
  s.events.push({
    minute: s.minute,
    type: "chance",
    side: atk.side,
    player: hero.name,
    text: `${atk.team.name} ${pick(s.rng, CHANCE_TEXT)}.`,
  });

  const quality = clamp(
    (atk.units.attack - def.units.defense) / 45 + 0.5 + (s.rng() - 0.5) * 0.4,
    0.08,
    0.96
  );
  const onTarget = s.rng() < 0.4 + quality * 0.22;
  if (!onTarget) {
    s.events.push({
      minute: s.minute,
      type: "chance",
      side: atk.side,
      player: hero.name,
      text: `${hero.name} ${pick(s.rng, OFF_TARGET)}`,
    });
    return;
  }

  atk.stats.shots++;
  const goalP = clamp(
    0.3 *
      (atk.units.finishing / Math.max(30, def.units.gk)) *
      (0.6 + quality * 0.8) *
      s.fatigue,
    0.05,
    0.72
  );

  if (s.rng() < goalP) {
    const scorer = pickWeighted(s.rng, atk.onPitch, attackWeight);
    if (atk.side === "home") s.score[0]++;
    else s.score[1]++;
    atk.stats.goals++;
    atk.goalsBy[scorer.name] = (atk.goalsBy[scorer.name] ?? 0) + 1;
    // Momentum a favor del que recibe (empuja a buscar)
    s.momentum += atk.side === "home" ? -0.35 : 0.35;
    s.momentum = clamp(s.momentum, -1, 1);
    s.events.push({
      minute: s.minute,
      type: "goal",
      side: atk.side,
      player: scorer.name,
      text: `¡GOOOL de ${atk.team.name}! Marca ${scorer.name}.`,
      score: [s.score[0], s.score[1]],
    });
  } else {
    s.events.push({
      minute: s.minute,
      type: "shot",
      side: atk.side,
      player: hero.name,
      text: `${hero.name} remata a puerta ${pick(s.rng, SAVED)}`,
    });
  }
}

function benchReplacementFor(
  ts: TeamState,
  slotPos: Position
): SimPlayer | null {
  if (ts.benchLeft.length === 0 || ts.subs >= 3) return null;
  // Mejor suplente por ajuste a la posición, luego overall.
  const rank = (p: SimPlayer) => {
    const f = positionFit(p.position, slotPos);
    const r = f === "exact" ? 0 : f === "compatible" ? 1 : f === "group" ? 2 : 3;
    return r * 1000 - p.overall;
  };
  const sorted = [...ts.benchLeft].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}

function doSub(
  s: MatchState,
  ts: TeamState,
  out: SimPlayer,
  reason: "injury" | "tactical"
): void {
  const inc = benchReplacementFor(ts, out.slotPos);
  if (!inc) return;
  inc.slotPos = out.slotPos;
  ts.onPitch = ts.onPitch.map((p) => (p === out ? inc : p));
  ts.benchLeft = ts.benchLeft.filter((p) => p !== inc);
  ts.subs++;
  s.events.push({
    minute: s.minute,
    type: "sub",
    side: ts.side,
    text:
      reason === "injury"
        ? `Cambio forzado en ${ts.team.name}: entra ${inc.name} por ${out.name}.`
        : `${ts.team.name} refresca: entra ${inc.name} por ${out.name}.`,
    player: inc.name,
  });
}

function minuteEvents(s: MatchState, ts: TeamState): void {
  // Falta / tarjetas
  if (s.rng() < 0.028) {
    ts.stats.fouls++;
    const offender = pick(s.rng, ts.onPitch);
    if (s.rng() < 0.012) {
      ts.stats.red++;
      // expulsado sale del campo (sin reemplazo)
      ts.onPitch = ts.onPitch.filter((p) => p !== offender);
      s.events.push({
        minute: s.minute,
        type: "red",
        side: ts.side,
        player: offender.name,
        text: `¡Roja para ${offender.name}! ${ts.team.name} con uno menos.`,
      });
    } else if (s.rng() < 0.22) {
      ts.stats.yellow++;
      s.events.push({
        minute: s.minute,
        type: "yellow",
        side: ts.side,
        player: offender.name,
        text: `Amarilla para ${offender.name}.`,
      });
    }
  }
  // Lesión -> cambio forzado
  if (s.rng() < 0.0045 && ts.onPitch.length > 7) {
    const injured = pick(s.rng, ts.onPitch);
    s.events.push({
      minute: s.minute,
      type: "injury",
      side: ts.side,
      player: injured.name,
      text: `${injured.name} cae lesionado.`,
    });
    doSub(s, ts, injured, "injury");
  }
}

export function runMinutes(
  s: MatchState,
  from: number,
  to: number,
  intensity: number,
  tempoMult: number,
  allowTacticalSubs: boolean
): void {
  for (let m = from; m <= to; m++) {
    s.minute = m;
    s.fatigue = m > 65 ? clamp(1 - (m - 65) * 0.003, 0.9, 1) : 1;

    for (const [atk, def] of [
      [s.home, s.away],
      [s.away, s.home],
    ] as [TeamState, TeamState][]) {
      const ratio =
        atk.units.attack / (atk.units.attack + def.units.defense);
      const share = possShareFor(s, atk);
      const mo = atk.side === "home" ? s.momentum : -s.momentum;
      let p =
        CHANCE_BASE *
        (0.6 + ratio) *
        (0.7 + 0.6 * share) *
        tempoMult *
        s.fatigue *
        intensity *
        (1 + mo * 0.15);
      p = clamp(p, 0.01, 0.45);
      if (s.rng() < p) attemptChance(s, atk, def);
      minuteEvents(s, atk);
    }

    // Cambios tácticos ~70 y ~78
    if (allowTacticalSubs && (m === 70 || m === 78)) {
      for (const ts of [s.home, s.away]) {
        if (ts.benchLeft.length > 0 && ts.subs < 3) {
          const weakest = [...ts.onPitch]
            .filter((p) => POSITION_GROUP[p.slotPos] !== "GK")
            .sort((a, b) => a.overall - b.overall)[0];
          if (weakest) doSub(s, ts, weakest, "tactical");
        }
      }
    }

    // decaimiento del momentum
    s.momentum *= 0.92;
  }
}
