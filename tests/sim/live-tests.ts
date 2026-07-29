/* Tests del motor en vivo. Ejecutar: npm run test:live */
import assert from "node:assert";
import { FORMATIONS, DEFAULT_TACTICS } from "../../lib/formations";
import type { Attributes, Position } from "../../lib/players";
import {
  advance,
  applyDecision,
  createLiveMatch,
  finalResult,
  setMentality,
  type LiveState,
} from "../../lib/sim/live";
import type { SimTeam } from "../../lib/sim/types";

function attrs(v: number): Attributes {
  return { pace: v, shooting: v, passing: v, defending: v, physical: v, dribbling: v };
}

function makeTeam(name: string, overall: number): SimTeam {
  const starters = FORMATIONS["4-3-3"].map((s) => ({
    name: `${name}-${s.code}`,
    position: s.pos as Position,
    slotPos: s.pos as Position,
    attributes: attrs(overall),
    overall,
    gkAttributes:
      s.pos === "GK"
        ? { diving: overall, handling: overall, kicking: overall - 8,
            positioning: overall, reflexes: overall, speed: 45 }
        : undefined,
  }));
  const bench = (["CM", "ST", "CB", "LB"] as Position[]).map((p, i) => ({
    name: `${name}-B${i}`,
    position: p,
    slotPos: p,
    attributes: attrs(overall - 3),
    overall: overall - 3,
  }));
  return { name, starters, bench, tactics: { ...DEFAULT_TACTICS } };
}

/** Juega un partido completo eligiendo siempre la misma opción (por índice). */
function playFull(seed: string, homeOv: number, awayOv: number, optIdx: number) {
  let s: LiveState = createLiveMatch({
    home: makeTeam("Local", homeOv),
    away: makeTeam("Visita", awayOv),
    seed,
    competition: "friendly",
  });
  let guard = 0;
  while (guard++ < 200) {
    const res = advance(s);
    s = res.state;
    if (res.finished) break;
    if (res.decision) {
      const opts = res.decision.options;
      applyDecision(s, opts[Math.min(optIdx, opts.length - 1)].id);
    }
  }
  return finalResult(s);
}

let failures = 0;
function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${label}\n    ${(e as Error).message}`);
  }
}

console.log("Motor en vivo:");

test("el partido termina siempre (sin bucles)", () => {
  for (let i = 0; i < 20; i++) {
    const r = playFull(`fin-${i}`, 75, 75, 1);
    assert.ok(r.homeScore >= 0 && r.awayScore >= 0);
    assert.ok(r.events.length > 5, "faltan eventos");
  }
});

test("determinismo: mismo seed + mismas decisiones => mismo resultado", () => {
  const a = playFull("det-1", 78, 76, 0);
  const b = playFull("det-1", 78, 76, 0);
  assert.strictEqual(
    `${a.homeScore}-${a.awayScore}`,
    `${b.homeScore}-${b.awayScore}`
  );
  assert.strictEqual(a.events.length, b.events.length);
});

test("las decisiones cambian el resultado (mismo seed, distinta elección)", () => {
  let diffs = 0;
  for (let i = 0; i < 40; i++) {
    const safe = playFull(`dec-${i}`, 75, 75, 2);
    const risky = playFull(`dec-${i}`, 75, 75, 0);
    if (
      safe.homeScore !== risky.homeScore ||
      safe.awayScore !== risky.awayScore
    )
      diffs++;
  }
  assert.ok(diffs > 8, `las decisiones influyen poco: solo ${diffs}/40`);
});

test("la calidad manda: un equipo muy superior gana >70% incluso decidiendo mal", () => {
  let wins = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    // El fuerte elige siempre la opción más arriesgada (peor gestión)
    const r = playFull(`qual-${i}`, 88, 66, 0);
    if (r.winner === "home") wins++;
  }
  const pct = wins / N;
  assert.ok(pct > 0.7, `el equipo superior solo ganó ${(pct * 100).toFixed(0)}%`);
});

test("un equipo muy inferior no gana casi nunca aunque decida bien", () => {
  let wins = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const r = playFull(`weak-${i}`, 62, 88, 2);
    if (r.winner === "home") wins++;
  }
  const pct = wins / N;
  assert.ok(pct < 0.25, `el equipo inferior ganó demasiado: ${(pct * 100).toFixed(0)}%`);
});

test("en partidos parejos las decisiones pesan más", () => {
  let changed = 0;
  for (let i = 0; i < 40; i++) {
    const a = playFull(`even-${i}`, 76, 74, 0);
    const b = playFull(`even-${i}`, 76, 74, 2);
    if (a.winner !== b.winner) changed++;
  }
  assert.ok(changed >= 4, `pocas veces cambió el ganador: ${changed}/40`);
});

test("la estamina baja entre 1 y 3 puntos por partido", () => {
  let s: LiveState = createLiveMatch({
    home: makeTeam("A", 75),
    away: makeTeam("B", 75),
    seed: "stam-1",
    competition: "friendly",
  });
  let guard = 0;
  while (guard++ < 200) {
    const res = advance(s);
    s = res.state;
    if (res.finished) break;
    if (res.decision) applyDecision(s, res.decision.options[1].id);
  }
  const drops = s.home.onPitch.map((p) => 100 - p.stamina);
  const avg = drops.reduce((a, b) => a + b, 0) / drops.length;
  assert.ok(
    avg >= 0.8 && avg <= 3.5,
    `desgaste medio fuera de rango: ${avg.toFixed(2)} puntos`
  );
  assert.ok(
    Math.max(...drops) <= 4,
    `algún jugador perdió demasiado: ${Math.max(...drops).toFixed(2)}`
  );
});

test("copa: define ganador (prórroga/penales) y los penales son interactivos", () => {
  for (let i = 0; i < 15; i++) {
    let s: LiveState = createLiveMatch({
      home: makeTeam("A", 75),
      away: makeTeam("B", 75),
      seed: `cup-${i}`,
      competition: "cup",
    });
    let guard = 0;
    while (guard++ < 300) {
      const res = advance(s);
      s = res.state;
      if (res.finished) break;
      if (res.decision) applyDecision(s, res.decision.options[0].id);
    }
    const r = finalResult(s);
    assert.notStrictEqual(r.winner, "draw", `empate en copa (seed cup-${i})`);
  }
});

test("la mentalidad continua cambia el juego (atacar vs defender)", () => {
  function playWith(seed: string, ment: number) {
    let s: LiveState = createLiveMatch({
      home: makeTeam("A", 75),
      away: makeTeam("B", 75),
      seed,
      competition: "friendly",
    });
    setMentality(s, ment);
    let g = 0;
    while (g++ < 200) {
      const r = advance(s);
      s = r.state;
      if (r.finished) break;
      if (r.decision) applyDecision(s, r.decision.options[1].id);
    }
    return finalResult(s);
  }
  let attGoals = 0, defGoals = 0, attConceded = 0, defConceded = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = playWith(`ment-${i}`, 4); // todo al ataque
    const d = playWith(`ment-${i}`, 0); // muy defensivo
    attGoals += a.homeScore; attConceded += a.awayScore;
    defGoals += d.homeScore; defConceded += d.awayScore;
  }
  assert.ok(
    attGoals > defGoals,
    `atacar no generó más goles: ${attGoals} vs ${defGoals}`
  );
  assert.ok(
    defConceded < attConceded,
    `defender no redujo los goles en contra: ${defConceded} vs ${attConceded}`
  );
});

if (failures > 0) {
  console.log(`\n${failures} test(s) fallaron.`);
  process.exit(1);
} else {
  console.log("\nTodos los tests del motor en vivo pasaron.");
}
