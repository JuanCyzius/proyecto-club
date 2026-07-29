import { computeUnits, tempoMultiplier } from "./ratings";
import { makeRng, clamp } from "./rng";
import { makeTeamState, runMinutes, type MatchState, type TeamState } from "./events";
import type {
  MatchResult,
  PlayerRating,
  SimInput,
  SimPlayer,
} from "./types";

function playerRatings(ts: TeamState, conceded: number): PlayerRating[] {
  const rngBase = 6.4;
  return ts.team.starters.map((p) => {
    const goals = ts.goalsBy[p.name] ?? 0;
    let r = rngBase + goals * 1.1;
    // porteros/defensas suben si encajaron poco
    if (
      (p.slotPos === "GK" || p.slotPos === "CB") &&
      conceded === 0
    )
      r += 0.6;
    if (p.slotPos === "GK" && conceded >= 3) r -= 0.6;
    return { name: p.name, rating: clamp(Math.round(r * 10) / 10, 4.5, 10), goals };
  });
}

function shootout(s: MatchState): [number, number] {
  const takers = (ts: TeamState): SimPlayer[] =>
    [...ts.onPitch].sort((a, b) => b.attributes.shooting - a.attributes.shooting);
  const homeTakers = takers(s.home);
  const awayTakers = takers(s.away);
  // Penales: usa reflejos reales del portero si existen.
  const gk = (ts: TeamState) => {
    const keeper = ts.onPitch.find((p) => p.slotPos === "GK");
    if (!keeper) return 55;
    const g = keeper.gkAttributes;
    if (g && (g.reflexes || g.diving)) {
      return 0.6 * (g.reflexes ?? 50) + 0.4 * (g.diving ?? 50);
    }
    return keeper.attributes.defending;
  };

  let hp = 0;
  let ap = 0;
  s.events.push({
    minute: 120,
    type: "penalties",
    text: "Se define desde los doce pasos.",
  });

  const kick = (taker: SimPlayer, gkRating: number): boolean => {
    const p = clamp(
      0.5 + (taker.attributes.shooting - gkRating) / 200 + (s.rng() - 0.5) * 0.15,
      0.5,
      0.92
    );
    return s.rng() < p;
  };

  const takeHome = (round: number) => {
    const t = homeTakers[round % homeTakers.length];
    if (kick(t, gk(s.away))) hp++;
    s.events.push({
      minute: 120,
      type: "penalty",
      side: "home",
      player: t.name,
      text: `Penal de ${t.name} (${hp}-${ap}).`,
    });
  };
  const takeAway = (round: number) => {
    const t = awayTakers[round % awayTakers.length];
    if (kick(t, gk(s.home))) ap++;
    s.events.push({
      minute: 120,
      type: "penalty",
      side: "away",
      player: t.name,
      text: `Penal de ${t.name} (${hp}-${ap}).`,
    });
  };

  // 5 tandas reglamentarias
  for (let round = 0; round < 5; round++) {
    takeHome(round);
    takeAway(round);
  }
  // muerte súbita (con salvaguarda)
  let round = 5;
  while (hp === ap && round < 20) {
    takeHome(round);
    takeAway(round);
    round++;
  }
  s.events.push({
    minute: 120,
    type: "shootout_end",
    text: `Definición por penales: ${hp}-${ap}.`,
  });
  return [hp, ap];
}

export function simulateMatch(input: SimInput): MatchResult {
  const rng = makeRng(input.seed);
  const unitsHome = computeUnits(input.home, true);
  const unitsAway = computeUnits(input.away, false);

  const home = makeTeamState("home", input.home, unitsHome);
  const away = makeTeamState("away", input.away, unitsAway);

  const possHome =
    unitsHome.midfield / (unitsHome.midfield + unitsAway.midfield);

  const state: MatchState = {
    home,
    away,
    score: [0, 0],
    events: [],
    rng,
    minute: 0,
    fatigue: 1,
    possHome,
    momentum: 0,
  };

  const tempo = tempoMultiplier(input.home, input.away);

  state.events.push({
    minute: 0,
    type: "kickoff",
    text: `¡Comienza el partido! ${input.home.name} vs ${input.away.name}.`,
    score: [0, 0],
  });

  runMinutes(state, 1, 45, 1, tempo, true);
  state.events.push({
    minute: 45,
    type: "halftime",
    text: `Descanso: ${state.score[0]}-${state.score[1]}.`,
    score: [state.score[0], state.score[1]],
  });
  runMinutes(state, 46, 90, 1, tempo, true);
  state.events.push({
    minute: 90,
    type: "fulltime",
    text: `Final del tiempo reglamentario: ${state.score[0]}-${state.score[1]}.`,
    score: [state.score[0], state.score[1]],
  });

  let wentToPenalties = false;
  let penalties: [number, number] | undefined;

  if (input.competition === "cup" && state.score[0] === state.score[1]) {
    state.events.push({
      minute: 90,
      type: "et_start",
      text: "Se juega la prórroga.",
    });
    runMinutes(state, 91, 120, 0.6, tempo, false);
    state.events.push({
      minute: 120,
      type: "et_end",
      text: `Tras la prórroga: ${state.score[0]}-${state.score[1]}.`,
      score: [state.score[0], state.score[1]],
    });
    if (state.score[0] === state.score[1]) {
      wentToPenalties = true;
      penalties = shootout(state);
    }
  }

  const [hg, ag] = state.score;
  home.stats.goals = hg;
  away.stats.goals = ag;
  home.stats.possession = Math.round(possHome * 100);
  away.stats.possession = 100 - home.stats.possession;

  let winner: "home" | "away" | "draw";
  if (hg > ag) winner = "home";
  else if (ag > hg) winner = "away";
  else if (penalties) winner = penalties[0] > penalties[1] ? "home" : "away";
  else winner = "draw";

  return {
    homeScore: hg,
    awayScore: ag,
    winner,
    wentToPenalties,
    penalties,
    events: state.events,
    stats: { home: home.stats, away: away.stats },
    ratings: {
      home: playerRatings(home, ag),
      away: playerRatings(away, hg),
    },
    seed: input.seed,
  };
}
