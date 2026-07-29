/* Tests del motor de simulación. Ejecutar: npm run test:sim */
import assert from "node:assert";
import { FORMATIONS, DEFAULT_TACTICS } from "../../lib/formations";
import type { Attributes, Position } from "../../lib/players";
import { simulateMatch } from "../../lib/sim";
import type { SimTeam } from "../../lib/sim/types";

function attrs(v: number): Attributes {
  return {
    pace: v,
    shooting: v,
    passing: v,
    defending: v,
    physical: v,
    dribbling: v,
  };
}

// Portero con stats reales (como los del CSV)
function gkStats(level: number) {
  return {
    diving: level,
    handling: level - 2,
    kicking: level - 8,
    positioning: level - 1,
    reflexes: level + 1,
    speed: 45,
  };
}

function makeTeam(name: string, overall: number, gkLevel?: number): SimTeam {
  const slots = FORMATIONS["4-3-3"];
  const starters = slots.map((s) => ({
    name: `${name}-${s.code}`,
    position: s.pos as Position,
    slotPos: s.pos as Position,
    attributes: attrs(overall),
    overall,
    gkAttributes:
      s.pos === "GK" ? gkStats(gkLevel ?? overall) : undefined,
  }));
  const bench = (["CM", "ST", "CB"] as Position[]).map((p, i) => ({
    name: `${name}-B${i}`,
    position: p,
    slotPos: p,
    attributes: attrs(overall - 3),
    overall: overall - 3,
  }));
  return { name, starters, bench, tactics: { ...DEFAULT_TACTICS } };
}

let failures = 0;
function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${label}`);
    console.log(`    ${(e as Error).message}`);
  }
}

console.log("Motor de simulación:");

test("determinismo: mismo seed => mismo resultado", () => {
  const home = makeTeam("A", 80);
  const away = makeTeam("B", 78);
  const r1 = simulateMatch({ home, away, seed: "seed-xyz", competition: "league" });
  const r2 = simulateMatch({ home, away, seed: "seed-xyz", competition: "league" });
  assert.deepStrictEqual(r1, r2, "resultados difieren con la misma seed");
});

test("seeds distintas => resultados distintos (variabilidad)", () => {
  const home = makeTeam("A", 78);
  const away = makeTeam("B", 78);
  const results = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const r = simulateMatch({
      home,
      away,
      seed: `v-${i}`,
      competition: "league",
    });
    results.add(`${r.homeScore}-${r.awayScore}`);
  }
  assert.ok(results.size >= 4, `poca variabilidad: ${results.size} marcadores`);
});

test("sanidad: equipo 88 gana >70% al equipo 66 (200 partidos)", () => {
  const strong = makeTeam("Fuerte", 88);
  const weak = makeTeam("Debil", 66);
  let wins = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch({
      home: strong,
      away: weak,
      seed: `s-${i}`,
      competition: "league",
    });
    if (r.winner === "home") wins++;
  }
  const pct = wins / N;
  assert.ok(pct > 0.7, `winrate del fuerte demasiado bajo: ${(pct * 100).toFixed(0)}%`);
});

test("copa: nunca termina en empate (define ganador)", () => {
  const home = makeTeam("A", 75);
  const away = makeTeam("B", 75);
  for (let i = 0; i < 30; i++) {
    const r = simulateMatch({
      home,
      away,
      seed: `cup-${i}`,
      competition: "cup",
    });
    assert.notStrictEqual(r.winner, "draw", `empate en copa (seed cup-${i})`);
  }
});

test("marcadores en rango razonable (media de goles < 6)", () => {
  const home = makeTeam("A", 80);
  const away = makeTeam("B", 80);
  let total = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch({
      home,
      away,
      seed: `g-${i}`,
      competition: "league",
    });
    total += r.homeScore + r.awayScore;
  }
  const avg = total / N;
  assert.ok(avg > 1 && avg < 6, `media de goles fuera de rango: ${avg.toFixed(2)}`);
});

test("portero: uno de 90 encaja menos que uno de 55 (100 partidos)", () => {
  const attackers = makeTeam("Atacantes", 80);
  let goodConceded = 0;
  let badConceded = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const good = makeTeam("ConBuenArquero", 75, 90);
    const bad = makeTeam("ConMalArquero", 75, 55);
    goodConceded += simulateMatch({
      home: attackers,
      away: good,
      seed: `gk-good-${i}`,
      competition: "league",
    }).homeScore;
    badConceded += simulateMatch({
      home: attackers,
      away: bad,
      seed: `gk-bad-${i}`,
      competition: "league",
    }).homeScore;
  }
  assert.ok(
    goodConceded < badConceded,
    `el buen arquero encajó ${goodConceded} y el malo ${badConceded}`
  );
});

test("posiciones nuevas (CF, RWB, LWB) funcionan en el motor", () => {
  const home = makeTeam("A", 78);
  const away = makeTeam("B", 78);
  // Reubicar algunos titulares a las posiciones nuevas
  home.starters[1].slotPos = "LWB";
  home.starters[4].slotPos = "RWB";
  home.starters[9].slotPos = "CF";
  const r = simulateMatch({
    home,
    away,
    seed: "newpos-1",
    competition: "league",
  });
  assert.ok(Number.isFinite(r.homeScore), "marcador inválido con posiciones nuevas");
  assert.ok(r.events.length > 5, "no se generaron eventos");
});

if (failures > 0) {
  console.log(`\n${failures} test(s) fallaron.`);
  process.exit(1);
} else {
  console.log("\nTodos los tests del motor pasaron.");
}
