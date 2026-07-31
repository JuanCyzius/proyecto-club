// ============================================================
// MOTOR DE PARTIDO EN VIVO (por tramos, con decisiones)
//
// Principios:
//  - Estado 100% serializable (se guarda en la BD entre tramos).
//  - Determinista: mismo estado + mismo RNG => mismo resultado.
//  - La calidad del equipo manda; las decisiones inclinan la balanza
//    (±12% como máximo), no la dan vuelta.
// ============================================================
import { POSITION_GROUP, positionFit, type Position } from "../players";
import { clamp, makeRngFromState, seedToState, type Rng } from "./rng";
import type {
  Competition,
  MatchEvent,
  PlayerRating,
  Side,
  SimPlayer,
  SimTeam,
  TeamStats,
} from "./types";
import {
  computeUnits,
  tempoMultiplier,
  amplifyUnitGap,
  applyHomeAdvantage,
} from "./ratings";

// ---------- Tipos ----------
export type LivePlayer = SimPlayer & {
  stamina: number;
  yellow: boolean;
  sentOff: boolean;
  goals: number;
  ratingPts: number;
};

export type Boost = {
  attack: number;
  defense: number;
  /** >1 = concedés más ocasiones al rival (precio de arriesgar). */
  risk: number;
  /** >1 = tus jugadores se cansan más rápido. */
  drain: number;
  until: number; // minuto en que expira (999 = todo el partido)
};

export type LiveTeam = {
  name: string;
  onPitch: LivePlayer[];
  bench: LivePlayer[];
  tactics: SimTeam["tactics"];
  subsLeft: number;
  stats: TeamStats;
  boost: Boost;
  morale: number; // -1 .. +1
};

export type DecisionOption = {
  id: string;
  label: string;
  hint: string;
  tone?: "safe" | "risky" | "neutral";
};

export type DecisionKind = "tactical" | "talk" | "star" | "penalty";

export type Decision = {
  kind: DecisionKind;
  title: string;
  subtitle: string;
  options: DecisionOption[];
  allowSub: boolean;
  /** Datos de la jugada del crack, si aplica. */
  star?: { player: string; overall: number };
  /** Índice de penal en la tanda. */
  penaltyIndex?: number;
};

/** Mentalidad continua: el usuario la mueve durante todo el partido. */
export const MENTALITY_LEVELS = [
  { id: "ultra_def", label: "Muy defensivo", attack: 0.80, defense: 1.18, risk: 0.70, drain: 0.85 },
  { id: "def",       label: "Defensivo",     attack: 0.91, defense: 1.09, risk: 0.84, drain: 0.92 },
  { id: "balanced",  label: "Equilibrado",   attack: 1.00, defense: 1.00, risk: 1.00, drain: 1.00 },
  { id: "att",       label: "Ofensivo",      attack: 1.09, defense: 0.91, risk: 1.16, drain: 1.10 },
  { id: "ultra_att", label: "Todo al ataque",attack: 1.18, defense: 0.79, risk: 1.34, drain: 1.25 },
] as const;

export type Phase =
  | "first_half"
  | "halftime"
  | "second_half"
  | "extra_time"
  | "shootout"
  | "done";

export type LiveState = {
  seed: string;
  rng: number;
  minute: number;
  phase: Phase;
  score: [number, number];
  home: LiveTeam;
  away: LiveTeam;
  events: MatchEvent[];
  competition: Competition;
  /** Minutos en los que hay que parar para decidir. */
  stops: number[];
  starLeft: number;
  pending: Decision | null;
  /** Contexto de la ocasión pausada por "jugada del crack". */
  starCtx: { side: Side; player: string } | null;
  shootout: { home: number; away: number; round: number; turn: Side } | null;
  wentToPenalties: boolean;
  /** Índice de MENTALITY_LEVELS elegido por el usuario (0-4). */
  mentality: number;
  /**
   * Momento (epoch ms) en que apareció la decisión pendiente. El
   * servidor la resuelve solo si pasan más de 7 segundos, así el
   * partido sigue corriendo aunque el usuario cambie de pestaña.
   */
  pendingSince?: number | null;
};

export type AdvanceResult = {
  state: LiveState;
  newEvents: MatchEvent[];
  decision: Decision | null;
  finished: boolean;
};

// ---------- Construcción ----------
function toLive(p: SimPlayer): LivePlayer {
  return {
    ...p,
    stamina: p.startStamina ?? 100,
    yellow: false,
    sentOff: false,
    goals: 0,
    ratingPts: 0,
  };
}

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

function toLiveTeam(t: SimTeam): LiveTeam {
  return {
    name: t.name,
    onPitch: t.starters.map(toLive),
    bench: t.bench.map(toLive),
    tactics: t.tactics,
    subsLeft: 3,
    stats: emptyStats(),
    boost: { attack: 1, defense: 1, risk: 1, drain: 1, until: 999 },
    morale: 0,
  };
}

export function createLiveMatch(input: {
  home: SimTeam;
  away: SimTeam;
  seed: string;
  competition: Competition;
}): LiveState {
  const state: LiveState = {
    seed: input.seed,
    rng: seedToState(input.seed),
    minute: 0,
    phase: "first_half",
    score: [0, 0],
    home: toLiveTeam(input.home),
    away: toLiveTeam(input.away),
    events: [
      {
        minute: 0,
        type: "kickoff",
        text: `¡Comienza el partido! ${input.home.name} vs ${input.away.name}.`,
        score: [0, 0],
      },
    ],
    competition: input.competition,
    // Paradas tácticas: una por tiempo + la del descanso (45)
    stops: [27, 45, 63, 78],
    starLeft: 2,
    pending: null,
    starCtx: null,
    shootout: null,
    wentToPenalties: false,
    mentality: 2, // equilibrado
  };
  return state;
}

// ---------- Utilidades ----------
const CHANCE_BASE = 0.11;

function teamOf(s: LiveState, side: Side): LiveTeam {
  return side === "home" ? s.home : s.away;
}
function other(side: Side): Side {
  return side === "home" ? "away" : "home";
}

/** Rating de unidades ajustado por estamina, moral y decisiones. */
function unitsFor(s: LiveState, side: Side) {
  const t = teamOf(s, side);
  const active = t.onPitch.filter((p) => !p.sentOff);
  const staminaFactor =
    active.length === 0
      ? 1
      : active.reduce((sum, p) => sum + staminaMult(p.stamina), 0) /
        active.length;

  const u = computeUnits(
    {
      name: t.name,
      starters: active,
      bench: t.bench,
      tactics: t.tactics,
    },
    false // la ventaja de local se aplica tras amplificar la brecha
  );

  const boostActive = s.minute <= t.boost.until;
  // La mentalidad continua solo aplica al equipo del usuario.
  const m =
    side === "home"
      ? MENTALITY_LEVELS[Math.max(0, Math.min(4, s.mentality))]
      : null;
  const ba = (boostActive ? t.boost.attack : 1) * (m ? m.attack : 1);
  const bd = (boostActive ? t.boost.defense : 1) * (m ? m.defense : 1);
  const moraleMult = 1 + t.morale * 0.05;
  // Penalización por expulsados
  const missing = 11 - active.length;
  const manPenalty = 1 - missing * 0.08;

  return {
    attack: u.attack * ba * staminaFactor * moraleMult * manPenalty,
    defense: u.defense * bd * staminaFactor * moraleMult * manPenalty,
    midfield: u.midfield * staminaFactor * moraleMult * manPenalty,
    finishing: u.finishing * ba * moraleMult,
    gk: u.gk,
  };
}

// Con el desgaste real (1-3 por partido), la fatiga se nota al acumular
// muchos partidos sin rotar, no dentro de un mismo partido.
function staminaMult(st: number): number {
  if (st >= 90) return 1;
  if (st >= 80) return 0.98;
  if (st >= 70) return 0.95;
  if (st >= 55) return 0.9;
  if (st >= 40) return 0.84;
  return 0.76;
}

function pickWeighted(
  rng: Rng,
  players: LivePlayer[],
  weight: (p: LivePlayer) => number
): LivePlayer {
  const active = players.filter((p) => !p.sentOff);
  if (active.length === 0) return players[0];
  const ws = active.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return active[0];
  let r = rng.next() * total;
  for (let i = 0; i < active.length; i++) {
    r -= ws[i];
    if (r <= 0) return active[i];
  }
  return active[active.length - 1];
}

function attackWeight(p: LivePlayer): number {
  const g = POSITION_GROUP[p.slotPos];
  const mult = g === "ATT" ? 1.6 : g === "MID" ? 0.8 : g === "DEF" ? 0.2 : 0.02;
  return (p.attributes.shooting + p.attributes.dribbling) * mult + 1;
}

function push(s: LiveState, ev: MatchEvent, bag: MatchEvent[]) {
  s.events.push(ev);
  bag.push(ev);
}

// ---------- Resolución de una ocasión ----------
function resolveChance(
  s: LiveState,
  rng: Rng,
  atkSide: Side,
  bag: MatchEvent[],
  forcedHero?: LivePlayer,
  qualityBonus = 0
) {
  const atk = teamOf(s, atkSide);
  const def = teamOf(s, other(atkSide));
  let [ua, ud] = amplifyUnitGap(
    unitsFor(s, atkSide),
    unitsFor(s, other(atkSide))
  );
  if (atkSide === "home") ua = applyHomeAdvantage(ua);
  else ud = applyHomeAdvantage(ud);

  atk.stats.chances++;
  const hero = forcedHero ?? pickWeighted(rng, atk.onPitch, attackWeight);

  const quality = clamp(
    (ua.attack - ud.defense) / 45 + 0.5 + (rng.next() - 0.5) * 0.4 + qualityBonus,
    0.08,
    0.96
  );

  const onTarget = rng.next() < 0.4 + quality * 0.22;
  if (!onTarget) {
    push(
      s,
      {
        minute: s.minute,
        type: "chance",
        side: atkSide,
        player: hero.name,
        text: `${hero.name} lo intenta pero el remate se va desviado.`,
      },
      bag
    );
    hero.ratingPts += 0.05;
    return;
  }

  atk.stats.shots++;
  const goalP = clamp(
    0.3 * (ua.finishing / Math.max(30, ud.gk)) * (0.6 + quality * 0.8),
    0.05,
    0.75
  );

  if (rng.next() < goalP) {
    if (atkSide === "home") s.score[0]++;
    else s.score[1]++;
    atk.stats.goals++;
    hero.goals++;
    hero.ratingPts += 1.1;
    atk.morale = clamp(atk.morale + 0.25, -1, 1);
    def.morale = clamp(def.morale - 0.2, -1, 1);
    push(
      s,
      {
        minute: s.minute,
        type: "goal",
        side: atkSide,
        player: hero.name,
        text: `¡GOOOL de ${atk.name}! Marca ${hero.name}.`,
        score: [s.score[0], s.score[1]],
      },
      bag
    );
  } else {
    hero.ratingPts += 0.15;
    push(
      s,
      {
        minute: s.minute,
        type: "shot",
        side: atkSide,
        player: hero.name,
        text: `${hero.name} remata a puerta ¡y el arquero responde!`,
      },
      bag
    );
  }
}

// ---------- Bucle de minutos ----------
function playMinute(s: LiveState, rng: Rng, bag: MatchEvent[]): boolean {
  const tempo = tempoMultiplier(
    { name: "", starters: [], bench: [], tactics: s.home.tactics },
    { name: "", starters: [], bench: [], tactics: s.away.tactics }
  );

  const [rawH, ua] = amplifyUnitGap(unitsFor(s, "home"), unitsFor(s, "away"));
  const uh = applyHomeAdvantage(rawH);
  const possHome = uh.midfield / (uh.midfield + ua.midfield);
  s.home.stats.possession = Math.round(possHome * 100);
  s.away.stats.possession = 100 - s.home.stats.possession;

  for (const side of ["home", "away"] as Side[]) {
    const t = teamOf(s, side);
    const u = side === "home" ? uh : ua;
    const ud = side === "home" ? ua : uh;
    const share = side === "home" ? possHome : 1 - possHome;
    // El riesgo del RIVAL es lo que abre espacios para este equipo.
    const rival = teamOf(s, other(side));
    const rivalMent =
      other(side) === "home"
        ? MENTALITY_LEVELS[Math.max(0, Math.min(4, s.mentality))].risk
        : 1;
    const rivalRisk =
      (s.minute <= rival.boost.until ? rival.boost.risk : 1) * rivalMent;

    const ratio = u.attack / (u.attack + ud.defense);
    let p =
      CHANCE_BASE * (0.6 + ratio) * (0.7 + 0.6 * share) * tempo * rivalRisk;
    p = clamp(p, 0.01, 0.45);

    if (rng.next() < p) {
      // ¿Jugada del crack? Solo para el equipo del usuario (home).
      if (
        side === "home" &&
        s.starLeft > 0 &&
        s.minute > 15 &&
        rng.next() < 0.35
      ) {
        const hero = pickWeighted(rng, s.home.onPitch, attackWeight);
        s.starLeft--;
        s.starCtx = { side, player: hero.name };
        s.pending = {
          kind: "star",
          title: "¡Jugada clara!",
          subtitle: `${hero.name} encara solo dentro del área. ¿Qué hace?`,
          star: { player: hero.name, overall: hero.overall },
          allowSub: false,
          options: [
            {
              id: "shoot",
              label: "Rematar",
              hint: `Usa su tiro (${hero.attributes.shooting})`,
              tone: "neutral",
            },
            {
              id: "dribble",
              label: "Encarar",
              hint: `Usa su regate (${hero.attributes.dribbling}). Más riesgo, más premio`,
              tone: "risky",
            },
            {
              id: "pass",
              label: "Ceder atrás",
              hint: `Usa su pase (${hero.attributes.passing}). Opción segura`,
              tone: "safe",
            },
          ],
        };
        return true; // pausa
      }
      resolveChance(s, rng, side, bag);
    }

    // Faltas y tarjetas
    if (rng.next() < 0.028) {
      t.stats.fouls++;
      const off = pickWeighted(rng, t.onPitch, () => 1);
      if (rng.next() < 0.012) {
        t.stats.red++;
        off.sentOff = true;
        push(
          s,
          {
            minute: s.minute,
            type: "red",
            side,
            player: off.name,
            text: `¡Roja para ${off.name}! ${t.name} se queda con uno menos.`,
          },
          bag
        );
      } else if (rng.next() < 0.22 && !off.yellow) {
        t.stats.yellow++;
        off.yellow = true;
        push(
          s,
          {
            minute: s.minute,
            type: "yellow",
            side,
            player: off.name,
            text: `Amarilla para ${off.name}.`,
          },
          bag
        );
      }
    }

    // Lesión
    if (rng.next() < 0.0035 && t.onPitch.filter((p) => !p.sentOff).length > 8) {
      const inj = pickWeighted(rng, t.onPitch, () => 1);
      push(
        s,
        {
          minute: s.minute,
          type: "injury",
          side,
          player: inj.name,
          text: `${inj.name} cae lesionado.`,
        },
        bag
      );
      autoSub(s, side, inj, bag, "injury");
    }

    // Desgaste: un partido completo cuesta ~1-3 puntos de estamina
    // sobre 100, según el esfuerzo (táctica arriesgada, ritmo alto)
    // y el físico del jugador. Se acumula entre partidos.
    for (const p of t.onPitch) {
      if (p.sentOff) continue;
      const wr = p.attributes.physical;
      const mentDrain =
        side === "home"
          ? MENTALITY_LEVELS[Math.max(0, Math.min(4, s.mentality))].drain
          : 1;
      const boostDrain =
        (s.minute <= t.boost.until ? t.boost.drain : 1) * mentDrain;
      // Base por minuto: 90 min * 0.0165 ≈ 1.5 puntos de partido.
      const perMinute =
        (0.011 + (100 - wr) * 0.00012 + (tempo - 1) * 0.006) * boostDrain;
      p.stamina = clamp(p.stamina - perMinute, 0, 100);
      p.ratingPts += 0.004;
    }
  }

  // La IA hace sus propios cambios
  if ((s.minute === 62 || s.minute === 75) && s.away.subsLeft > 0) {
    const tired = [...s.away.onPitch]
      .filter((p) => !p.sentOff && POSITION_GROUP[p.slotPos] !== "GK")
      .sort((a, b) => a.stamina - b.stamina)[0];
    if (tired && tired.stamina < 70) autoSub(s, "away", tired, bag, "tactical");
  }

  return false;
}

function autoSub(
  s: LiveState,
  side: Side,
  out: LivePlayer,
  bag: MatchEvent[],
  reason: "injury" | "tactical"
) {
  const t = teamOf(s, side);
  if (t.subsLeft <= 0 || t.bench.length === 0) return;
  const rank = (p: LivePlayer) => {
    const f = positionFit(p.position, out.slotPos);
    const r = f === "exact" ? 0 : f === "compatible" ? 1 : f === "group" ? 2 : 3;
    return r * 1000 - p.overall;
  };
  const inc = [...t.bench].sort((a, b) => rank(a) - rank(b))[0];
  if (!inc) return;
  applySub(s, side, out.name, inc.name, bag, reason);
}

export function applySub(
  s: LiveState,
  side: Side,
  outName: string,
  inName: string,
  bag: MatchEvent[],
  reason: "injury" | "tactical" | "manual" = "manual"
): boolean {
  const t = teamOf(s, side);
  if (t.subsLeft <= 0) return false;
  const outIdx = t.onPitch.findIndex((p) => p.name === outName);
  const inIdx = t.bench.findIndex((p) => p.name === inName);
  if (outIdx < 0 || inIdx < 0) return false;

  const out = t.onPitch[outIdx];
  const inc = t.bench[inIdx];
  inc.slotPos = out.slotPos;
  t.onPitch[outIdx] = inc;
  t.bench.splice(inIdx, 1);
  t.subsLeft--;

  const ev: MatchEvent = {
    minute: s.minute,
    type: "sub",
    side,
    player: inc.name,
    text:
      reason === "injury"
        ? `Cambio forzado en ${t.name}: entra ${inc.name} por ${out.name}.`
        : `Cambio en ${t.name}: entra ${inc.name} por ${out.name}.`,
  };
  s.events.push(ev);
  bag.push(ev);
  return true;
}

// ---------- Decisiones tácticas ----------
function tacticalDecision(s: LiveState): Decision {
  const diff = s.score[0] - s.score[1];
  const losing = diff < 0;
  const winning = diff > 0;

  if (losing) {
    return {
      kind: "tactical",
      title: "Vas por detrás",
      subtitle: `Minuto ${s.minute}. ${s.score[0]}-${s.score[1]}. Hay que mover el partido.`,
      allowSub: true,
      options: [
        {
          id: "all_in",
          label: "Ir al frente",
          hint: "Mucho más ataque, pero te exponés al contragolpe",
          tone: "risky",
        },
        {
          id: "press",
          label: "Presión alta",
          hint: "Recuperás más arriba, gastás más estamina",
          tone: "neutral",
        },
        {
          id: "patient",
          label: "Paciencia",
          hint: "Sin locuras: mantenés el orden y buscás el hueco",
          tone: "safe",
        },
      ],
    };
  }

  if (winning) {
    return {
      kind: "tactical",
      title: "Vas ganando",
      subtitle: `Minuto ${s.minute}. ${s.score[0]}-${s.score[1]}. ¿Cerrás o buscás más?`,
      allowSub: true,
      options: [
        {
          id: "shut",
          label: "Cerrar el partido",
          hint: "Te replegás: más defensa, casi sin ataque",
          tone: "safe",
        },
        {
          id: "manage",
          label: "Administrar",
          hint: "Equilibrio y control del ritmo",
          tone: "neutral",
        },
        {
          id: "kill",
          label: "Buscar el siguiente",
          hint: "Vas por más, dejando espacios atrás",
          tone: "risky",
        },
      ],
    };
  }

  return {
    kind: "tactical",
    title: "Partido parejo",
    subtitle: `Minuto ${s.minute}. ${s.score[0]}-${s.score[1]}. Hay que romper el empate.`,
    allowSub: true,
    options: [
      {
        id: "accelerate",
        label: "Acelerar",
        hint: "Más ritmo y más ocasiones, para los dos",
        tone: "risky",
      },
      {
        id: "control",
        label: "Controlar",
        hint: "Manejás la pelota y esperás tu momento",
        tone: "neutral",
      },
      {
        id: "solid",
        label: "Asegurar",
        hint: "Prioridad al orden: difícil que te hagan gol",
        tone: "safe",
      },
    ],
  };
}

// `risk` sube las ocasiones del RIVAL (el precio de exponerse) y `drain`
// acelera el desgaste. Así las opciones arriesgadas tienen coste real:
// sirven cuando necesitás el gol, y te castigan cuando no.
const TACTIC_EFFECTS: Record<
  string,
  {
    attack: number;
    defense: number;
    risk: number;
    drain: number;
    text: string;
  }
> = {
  all_in:    { attack: 1.14, defense: 0.78, risk: 1.35, drain: 1.35, text: "Todo el equipo se vuelca al ataque." },
  press:     { attack: 1.07, defense: 0.92, risk: 1.15, drain: 1.30, text: "El equipo aprieta la salida rival." },
  patient:   { attack: 1.02, defense: 1.04, risk: 0.94, drain: 0.95, text: "El equipo se ordena y busca con calma." },
  shut:      { attack: 0.82, defense: 1.16, risk: 0.72, drain: 0.85, text: "El equipo se repliega para defender la ventaja." },
  manage:    { attack: 0.98, defense: 1.07, risk: 0.88, drain: 0.90, text: "El equipo administra el partido." },
  kill:      { attack: 1.11, defense: 0.86, risk: 1.25, drain: 1.20, text: "El equipo va por la sentencia." },
  accelerate:{ attack: 1.10, defense: 0.88, risk: 1.28, drain: 1.25, text: "Sube el ritmo del partido." },
  control:   { attack: 1.03, defense: 1.03, risk: 0.94, drain: 1.00, text: "El equipo toma el control de la pelota." },
  solid:     { attack: 0.90, defense: 1.14, risk: 0.78, drain: 0.88, text: "El equipo se cierra atrás." },
};

const TALK_OPTIONS: DecisionOption[] = [
  {
    id: "demand",
    label: "Exigir",
    hint: "Sube a los de carácter fuerte, hunde a los frágiles",
    tone: "risky",
  },
  {
    id: "calm",
    label: "Calmar",
    hint: "Efecto pequeño pero seguro para todos",
    tone: "safe",
  },
  {
    id: "motivate",
    label: "Motivar",
    hint: "Buen empujón si el partido está de cara",
    tone: "neutral",
  },
];

function halftimeDecision(s: LiveState): Decision {
  const diff = s.score[0] - s.score[1];
  return {
    kind: "talk",
    title: "Descanso",
    subtitle:
      diff < 0
        ? `Vas ${s.score[0]}-${s.score[1]}. ¿Qué les decís en el vestuario?`
        : diff > 0
          ? `Ganás ${s.score[0]}-${s.score[1]}. ¿Qué les decís en el vestuario?`
          : `Empate ${s.score[0]}-${s.score[1]}. ¿Qué les decís en el vestuario?`,
    allowSub: true,
    options: TALK_OPTIONS,
  };
}

// ---------- Aplicar decisión ----------
export function applyDecision(
  s: LiveState,
  optionId: string
): { newEvents: MatchEvent[] } {
  const bag: MatchEvent[] = [];
  const rng = makeRngFromState(s.rng);
  const d = s.pending;
  if (!d) return { newEvents: bag };

  if (d.kind === "tactical") {
    const e = TACTIC_EFFECTS[optionId] ?? TACTIC_EFFECTS.control;
    s.home.boost = {
      attack: e.attack,
      defense: e.defense,
      risk: e.risk,
      drain: e.drain,
      until: 999,
    };
    push(
      s,
      { minute: s.minute, type: "sub", side: "home", text: `📋 ${e.text}` },
      bag
    );
  }

  if (d.kind === "talk") {
    // El efecto depende de la personalidad (derivada del work rate real)
    let delta = 0;
    const strong = s.home.onPitch.filter(
      (p) => p.attributes.physical >= 70
    ).length;
    if (optionId === "demand") {
      delta = strong >= 6 ? 0.35 : -0.2;
    } else if (optionId === "calm") {
      delta = 0.12;
    } else {
      delta = s.score[0] >= s.score[1] ? 0.28 : 0.05;
    }
    s.home.morale = clamp(s.home.morale + delta, -1, 1);
    const txt =
      delta > 0.2
        ? "El equipo sale enchufado del vestuario."
        : delta > 0
          ? "El equipo sale tranquilo."
          : "El mensaje no cayó bien en el vestuario.";
    push(
      s,
      { minute: s.minute, type: "sub", side: "home", text: `🗣️ ${txt}` },
      bag
    );
  }

  if (d.kind === "star" && s.starCtx) {
    const hero = s.home.onPitch.find((p) => p.name === s.starCtx!.player);
    if (hero) {
      if (optionId === "shoot") {
        resolveChance(s, rng, "home", bag, hero, 0.05);
      } else if (optionId === "dribble") {
        const success = rng.next() < clamp(hero.attributes.dribbling / 140, 0.25, 0.75);
        if (success) {
          push(
            s,
            {
              minute: s.minute,
              type: "chance",
              side: "home",
              player: hero.name,
              text: `${hero.name} se saca al defensor de encima. ¡Queda solo!`,
            },
            bag
          );
          resolveChance(s, rng, "home", bag, hero, 0.3);
        } else {
          push(
            s,
            {
              minute: s.minute,
              type: "chance",
              side: "home",
              player: hero.name,
              text: `${hero.name} intenta el regate pero le roban la pelota.`,
            },
            bag
          );
        }
      } else {
        const mate = pickWeighted(rng, s.home.onPitch, attackWeight);
        const ok = rng.next() < clamp(hero.attributes.passing / 130, 0.35, 0.85);
        if (ok) {
          push(
            s,
            {
              minute: s.minute,
              type: "chance",
              side: "home",
              player: mate.name,
              text: `${hero.name} la cede atrás para ${mate.name}.`,
            },
            bag
          );
          resolveChance(s, rng, "home", bag, mate, 0.12);
        } else {
          push(
            s,
            {
              minute: s.minute,
              type: "chance",
              side: "home",
              player: hero.name,
              text: `${hero.name} busca el pase pero la defensa la corta.`,
            },
            bag
          );
        }
      }
    }
    s.starCtx = null;
  }

  if (d.kind === "penalty" && s.shootout) {
    resolvePenalty(s, rng, optionId, bag);
  }

  s.rng = rng.state();
  s.pending = null;
  return { newEvents: bag };
}

// ---------- Penales ----------
const CORNERS = ["left", "center", "right"] as const;

function penaltyDecision(s: LiveState): Decision {
  const sh = s.shootout!;
  return {
    kind: "penalty",
    title: `Penales · ${sh.home}-${sh.away}`,
    subtitle: `Tanda ${sh.round + 1}. Elegí dónde patear.`,
    allowSub: false,
    penaltyIndex: sh.round,
    options: [
      { id: "left", label: "Izquierda", hint: "", tone: "neutral" },
      { id: "center", label: "Centro", hint: "", tone: "neutral" },
      { id: "right", label: "Derecha", hint: "", tone: "neutral" },
    ],
  };
}

function resolvePenalty(
  s: LiveState,
  rng: Rng,
  corner: string,
  bag: MatchEvent[]
) {
  const sh = s.shootout!;
  const taker = [...s.home.onPitch]
    .filter((p) => !p.sentOff)
    .sort((a, b) => b.attributes.shooting - a.attributes.shooting)[
    sh.round % Math.max(1, s.home.onPitch.length)
  ];
  const keeperGuess = CORNERS[Math.floor(rng.next() * 3)];
  const skill = taker?.attributes.shooting ?? 60;
  // Si el arquero adivina, baja mucho la probabilidad
  const base = clamp(0.5 + skill / 260, 0.55, 0.9);
  const p = keeperGuess === corner ? base * 0.35 : base;
  const scored = rng.next() < p;
  if (scored) sh.home++;
  push(
    s,
    {
      minute: 120,
      type: "penalty",
      side: "home",
      player: taker?.name,
      text: scored
        ? `⚽ ${taker?.name ?? "Tu equipo"} marca. ${sh.home}-${sh.away}`
        : `❌ ${taker?.name ?? "Tu equipo"} la falla. ${sh.home}-${sh.away}`,
    },
    bag
  );

  // Turno del rival (automático)
  const aiTaker = [...s.away.onPitch].sort(
    (a, b) => b.attributes.shooting - a.attributes.shooting
  )[sh.round % Math.max(1, s.away.onPitch.length)];
  const gkRef = s.home.onPitch.find((p) => p.slotPos === "GK");
  const gkSkill =
    gkRef?.gkAttributes?.reflexes ?? gkRef?.attributes.defending ?? 60;
  const aiP = clamp(
    0.5 + (aiTaker?.attributes.shooting ?? 60) / 260 - gkSkill / 900,
    0.5,
    0.88
  );
  const aiScored = rng.next() < aiP;
  if (aiScored) sh.away++;
  push(
    s,
    {
      minute: 120,
      type: "penalty",
      side: "away",
      player: aiTaker?.name,
      text: aiScored
        ? `${aiTaker?.name ?? "El rival"} marca. ${sh.home}-${sh.away}`
        : `¡Tu arquero la ataja! ${sh.home}-${sh.away}`,
    },
    bag
  );

  sh.round++;
}

function shootoutDecided(s: LiveState): boolean {
  const sh = s.shootout!;
  if (sh.round < 5) return false;
  return sh.home !== sh.away;
}

// ---------- Avance por tramos ----------
export function advance(s: LiveState): AdvanceResult {
  const bag: MatchEvent[] = [];
  const rng = makeRngFromState(s.rng);

  if (s.pending) {
    return { state: s, newEvents: bag, decision: s.pending, finished: false };
  }

  // Tanda de penales
  if (s.phase === "shootout") {
    if (shootoutDecided(s)) return finish(s, bag, rng);
    s.pending = penaltyDecision(s);
    s.rng = rng.state();
    return { state: s, newEvents: bag, decision: s.pending, finished: false };
  }

  const endMinute =
    s.phase === "first_half"
      ? 45
      : s.phase === "second_half"
        ? 90
        : s.phase === "extra_time"
          ? 120
          : 45;

  while (s.minute < endMinute) {
    s.minute++;
    const paused = playMinute(s, rng, bag);
    if (paused) {
      s.rng = rng.state();
      return { state: s, newEvents: bag, decision: s.pending, finished: false };
    }
    if (s.stops.includes(s.minute) && s.minute !== 45) {
      s.pending = tacticalDecision(s);
      s.rng = rng.state();
      return { state: s, newEvents: bag, decision: s.pending, finished: false };
    }
  }

  // Fin de tiempo
  if (s.phase === "first_half") {
    push(
      s,
      {
        minute: 45,
        type: "halftime",
        text: `Descanso: ${s.score[0]}-${s.score[1]}.`,
        score: [s.score[0], s.score[1]],
      },
      bag
    );
    s.phase = "halftime";
    s.pending = halftimeDecision(s);
    // Pequeño respiro en el descanso
    for (const t of [s.home, s.away]) {
      for (const p of t.onPitch) p.stamina = clamp(p.stamina + 0.3, 0, 100);
    }
    s.rng = rng.state();
    return { state: s, newEvents: bag, decision: s.pending, finished: false };
  }

  if (s.phase === "halftime") {
    s.phase = "second_half";
    s.rng = rng.state();
    return advance(s);
  }

  if (s.phase === "second_half") {
    push(
      s,
      {
        minute: 90,
        type: "fulltime",
        text: `Final del tiempo reglamentario: ${s.score[0]}-${s.score[1]}.`,
        score: [s.score[0], s.score[1]],
      },
      bag
    );
    if (s.competition === "cup" && s.score[0] === s.score[1]) {
      push(s, { minute: 90, type: "et_start", text: "Se juega la prórroga." }, bag);
      s.phase = "extra_time";
      s.rng = rng.state();
      return advance(s);
    }
    return finish(s, bag, rng);
  }

  if (s.phase === "extra_time") {
    push(
      s,
      {
        minute: 120,
        type: "et_end",
        text: `Tras la prórroga: ${s.score[0]}-${s.score[1]}.`,
        score: [s.score[0], s.score[1]],
      },
      bag
    );
    if (s.score[0] === s.score[1]) {
      s.wentToPenalties = true;
      s.shootout = { home: 0, away: 0, round: 0, turn: "home" };
      s.phase = "shootout";
      push(s, { minute: 120, type: "penalties", text: "Se define desde los doce pasos." }, bag);
      s.pending = penaltyDecision(s);
      s.rng = rng.state();
      return { state: s, newEvents: bag, decision: s.pending, finished: false };
    }
    return finish(s, bag, rng);
  }

  return finish(s, bag, rng);
}

function finish(s: LiveState, bag: MatchEvent[], rng: Rng): AdvanceResult {
  s.phase = "done";
  s.rng = rng.state();
  return { state: s, newEvents: bag, decision: null, finished: true };
}

// ---------- Resultado final ----------
export function finalResult(s: LiveState) {
  const [hg, ag] = s.score;
  let winner: Side | "draw";
  if (hg > ag) winner = "home";
  else if (ag > hg) winner = "away";
  else if (s.shootout)
    winner = s.shootout.home > s.shootout.away ? "home" : "away";
  else winner = "draw";

  const ratings = (t: LiveTeam, conceded: number): PlayerRating[] =>
    [...t.onPitch, ...t.bench].map((p) => {
      let r = 6.2 + p.ratingPts;
      if ((p.slotPos === "GK" || p.slotPos === "CB") && conceded === 0) r += 0.6;
      if (p.slotPos === "GK" && conceded >= 3) r -= 0.6;
      return {
        name: p.name,
        rating: clamp(Math.round(r * 10) / 10, 4.5, 10),
        goals: p.goals,
      };
    });

  return {
    homeScore: hg,
    awayScore: ag,
    winner,
    wentToPenalties: s.wentToPenalties,
    penalties: s.shootout
      ? ([s.shootout.home, s.shootout.away] as [number, number])
      : undefined,
    events: s.events,
    stats: { home: s.home.stats, away: s.away.stats },
    ratings: { home: ratings(s.home, ag), away: ratings(s.away, hg) },
    seed: s.seed,
  };
}

/** Vista ligera del estado para el cliente (sin datos sensibles). */
export function publicView(s: LiveState) {
  const team = (t: LiveTeam) => ({
    name: t.name,
    subsLeft: t.subsLeft,
    onPitch: t.onPitch.map((p) => ({
      name: p.name,
      pos: p.slotPos,
      overall: p.overall,
      stamina: Math.round(p.stamina),
      yellow: p.yellow,
      sentOff: p.sentOff,
      goals: p.goals,
    })),
    bench: t.bench.map((p) => ({
      name: p.name,
      pos: p.position,
      overall: p.overall,
      stamina: Math.round(p.stamina),
    })),
  });
  return {
    minute: s.minute,
    phase: s.phase,
    mentality: s.mentality,
    score: s.score,
    home: team(s.home),
    away: team(s.away),
    shootout: s.shootout,
  };
}

export type PublicMatchView = ReturnType<typeof publicView>;

/** Cambia la mentalidad del equipo del usuario en cualquier momento. */
export function setMentality(s: LiveState, level: number): MatchEvent | null {
  const next = Math.max(0, Math.min(4, Math.round(level)));
  if (next === s.mentality) return null;
  s.mentality = next;
  const ev: MatchEvent = {
    minute: s.minute,
    type: "sub",
    side: "home",
    text: `📋 Mentalidad: ${MENTALITY_LEVELS[next].label}.`,
  };
  s.events.push(ev);
  return ev;
}

/** Desgaste sufrido por cada carta del usuario, para persistirlo. */
export function staminaDrops(s: LiveState): {
  cardIds: string[];
  drops: number[];
} {
  const cardIds: string[] = [];
  const drops: number[] = [];
  for (const p of [...s.home.onPitch, ...s.home.bench]) {
    if (!p.cardId) continue;
    const start = p.startStamina ?? 100;
    const drop = Math.max(0, start - p.stamina);
    if (drop > 0.05) {
      cardIds.push(p.cardId);
      drops.push(Math.round(drop * 100) / 100);
    }
  }
  return { cardIds, drops };
}
