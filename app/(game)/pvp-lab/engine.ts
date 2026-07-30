/**
 * LABORATORIO PvP — motor de juego (prototipo aislado)
 *
 * Diseño pensado para servidor autoritativo:
 * - El estado avanza SOLO con `step(state, inputs, dt)`: función pura
 *   sobre un estado serializable + entradas de AMBOS lados por tick.
 * - Hoy el lado B lo maneja un bot local (`botInput`), pero la firma ya
 *   es simétrica: para el online real, el servidor corre `step` con los
 *   inputs recibidos y emite snapshots; los clientes solo renderizan y
 *   predicen. Nada del motor depende de React ni del DOM.
 * - 70/30 habilidad/stats: los atributos de las cartas modulan
 *   velocidad, precisión, potencia y reflejos en un rango acotado
 *   (0.85–1.15); la puntería, el timing y el posicionamiento los pone
 *   el jugador.
 *
 * Cancha: coordenadas lógicas 100 × 160 (vertical). Arco arriba
 * (y=0, boca x∈[35,65]). El usuario siempre juega "hacia arriba":
 * atacando controla al delantero; defendiendo controla al arquero.
 */

export type V = { x: number; y: number };
export type Input = { mx: number; my: number; sprint: boolean; action: boolean };
export const NO_INPUT: Input = { mx: 0, my: 0, sprint: false, action: false };

/** Stats agregadas del equipo (derivadas de las cartas, 40–99). */
export type TeamStats = {
  pace: number;
  shooting: number;
  control: number;
  power: number;
  reflexes: number; // arquero
};

const mod = (v: number) => 0.85 + (Math.max(40, Math.min(99, v)) / 99) * 0.3;

export type SituationKind = "counter" | "duel" | "cross" | "penalty";
export const KIND_LABEL: Record<SituationKind, string> = {
  counter: "Contraataque",
  duel: "Mano a mano",
  cross: "Centro al área",
  penalty: "Penal",
};

export type Actor = {
  pos: V;
  vel: V;
  r: number;
  kind: "me" | "rival" | "gk";
  stamina: number; // 0-1, se gasta con sprint
};

export type Ball = {
  pos: V;
  vel: V;
  z: number; // altura (para centros)
  vz: number;
  owner: number | null; // índice del actor que la lleva
  shot: boolean; // en viaje hacia el arco
};

export type Scene = {
  kind: SituationKind;
  /** true: el usuario ataca (controla actor 0, delantero). false: defiende (controla actor 0, arquero). */
  attacking: boolean;
  t: number;
  actors: Actor[];
  ball: Ball;
  aim: V; // punto de mira del penal
  done: null | { goal: boolean; text: string };
  banner: string;
};

export type MatchState = {
  play: number; // jugada actual (1..TOTAL_PLAYS)
  myGoals: number;
  rivalGoals: number;
  scene: Scene;
  finished: boolean;
};

export const TOTAL_PLAYS = 8;
const SCENE_TIME = 12;
const GOAL_L = 35;
const GOAL_R = 65;
export const FIELD_W = 100;
export const FIELD_H = 160;

const rnd = () => Math.random();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

// ------------------------------------------------------------------
// Creación de escenas
// ------------------------------------------------------------------
function actor(x: number, y: number, kind: Actor["kind"], r = 2.6): Actor {
  return { pos: { x, y }, vel: { x: 0, y: 0 }, r, kind, stamina: 1 };
}

export function makeScene(kind: SituationKind, attacking: boolean): Scene {
  const s: Scene = {
    kind,
    attacking,
    t: 0,
    actors: [],
    ball: { pos: { x: 50, y: 100 }, vel: { x: 0, y: 0 }, z: 0, vz: 0, owner: null, shot: false },
    aim: { x: 50, y: 4 },
    done: null,
    banner: `${KIND_LABEL[kind]} · ${attacking ? "ATACÁS" : "DEFENDÉS"}`,
  };

  // Actor 0 = el que controla el usuario
  if (attacking) {
    const striker = actor(38 + rnd() * 24, 128, "me");
    const gk = actor(50, 6, "gk");
    s.actors = [striker, gk];
    if (kind === "counter") {
      s.actors.push(actor(30, 60, "rival"), actor(70, 66, "rival"));
      s.ball.owner = 0;
    } else if (kind === "duel") {
      striker.pos.y = 96;
      s.actors.push(actor(striker.pos.x + (rnd() < 0.5 ? -14 : 14), 112, "rival"));
      s.ball.owner = 0;
    } else if (kind === "cross") {
      striker.pos = { x: 58, y: 46 };
      s.actors.push(actor(44, 34, "rival"));
      // Pelota viene volando desde la banda izquierda hacia el punto penal
      s.ball.pos = { x: 6, y: 62 };
      s.ball.z = 1;
      const T = 1.35;
      s.ball.vel = { x: (48 - 6) / T, y: (24 - 62) / T };
      s.ball.vz = 4.2;
      s.ball.owner = null;
    } else {
      striker.pos = { x: 50, y: 34 };
      s.ball.pos = { x: 50, y: 24 };
      s.ball.owner = null;
      s.banner = "PENAL · Apuntá con el joystick y disparó con Acción";
    }
  } else {
    // Defendiendo: actor 0 es TU arquero; el bot ataca hacia arriba.
    const gk = actor(50, 6, "me", 2.8);
    const striker = actor(38 + rnd() * 24, kind === "duel" ? 96 : 126, "rival");
    s.actors = [gk, striker];
    if (kind === "counter") s.actors.push(actor(62, 70, "rival"));
    if (kind === "cross") {
      striker.pos = { x: 56, y: 44 };
      s.ball.pos = { x: 6, y: 62 };
      s.ball.z = 1;
      const T = 1.35;
      s.ball.vel = { x: (46 - 6) / T, y: (24 - 62) / T };
      s.ball.vz = 4.2;
      s.ball.owner = null;
    } else if (kind === "penalty") {
      striker.pos = { x: 50, y: 34 };
      s.ball.pos = { x: 50, y: 24 };
      s.banner = "PENAL EN CONTRA · Movete y tirate con Acción";
    } else {
      s.ball.owner = 1;
    }
  }
  return s;
}

export function newMatch(): MatchState {
  return {
    play: 1,
    myGoals: 0,
    rivalGoals: 0,
    scene: makeScene(randKind(true), true),
    finished: false,
  };
}

function randKind(first = false): SituationKind {
  const pool: SituationKind[] = first
    ? ["counter", "duel", "cross"]
    : ["counter", "duel", "cross", "penalty"];
  return pool[Math.floor(rnd() * pool.length)];
}

// ------------------------------------------------------------------
// Física de actores y pelota
// ------------------------------------------------------------------
function moveActor(a: Actor, inp: Input, stats: TeamStats, dt: number, isGk: boolean) {
  const sprint = inp.sprint && a.stamina > 0.05 && !isGk;
  const top = (isGk ? 26 : 30) * mod(stats.pace) * (sprint ? 1.45 : 1);
  const accel = 210 * mod(stats.control);
  const tx = inp.mx * top;
  const ty = inp.my * top;
  a.vel.x += clamp(tx - a.vel.x, -accel * dt, accel * dt);
  a.vel.y += clamp(ty - a.vel.y, -accel * dt, accel * dt);
  a.pos.x = clamp(a.pos.x + a.vel.x * dt, 2, FIELD_W - 2);
  a.pos.y = clamp(a.pos.y + a.vel.y * dt, 2, FIELD_H - 4);
  if (isGk) {
    // El arquero vive en su área
    a.pos.x = clamp(a.pos.x, GOAL_L - 6, GOAL_R + 6);
    a.pos.y = clamp(a.pos.y, 3, 22);
  }
  a.stamina = clamp(a.stamina + (sprint ? -0.35 : 0.18) * dt, 0, 1);
}

function moveBall(b: Ball, actors: Actor[], dt: number) {
  if (b.owner != null) {
    // La pelota acompaña al que la lleva, apenas adelantada a su marcha
    const o = actors[b.owner];
    const sp = Math.hypot(o.vel.x, o.vel.y);
    const lead = clamp(sp * 0.045, 1.2, 3.2);
    const dir = sp > 1 ? { x: o.vel.x / sp, y: o.vel.y / sp } : { x: 0, y: -1 };
    b.pos.x = o.pos.x + dir.x * lead;
    b.pos.y = o.pos.y + dir.y * lead;
    b.z = 0;
    return;
  }
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  const fr = b.z > 0.05 ? 0.995 : 0.975; // por el aire roza menos
  b.vel.x *= fr;
  b.vel.y *= fr;
  if (b.z > 0 || b.vz !== 0) {
    b.z = Math.max(0, b.z + b.vz * dt);
    b.vz -= 9.5 * dt;
    if (b.z === 0 && b.vz < 0) b.vz = Math.abs(b.vz) * 0.35; // pique
    if (b.vz < 0.2 && b.z === 0) b.vz = 0;
  }
}

// ------------------------------------------------------------------
// IA del rival (usa las stats del equipo bot)
// ------------------------------------------------------------------
export function botInput(m: MatchState, bot: TeamStats): Input {
  const s = m.scene;
  const inp: Input = { mx: 0, my: 0, sprint: false, action: false };
  const seek = (a: Actor, target: V, sprint = false) => {
    const dx = target.x - a.pos.x;
    const dy = target.y - a.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    return { mx: dx / d, my: dy / d, sprint, action: false };
  };

  if (s.attacking) {
    // El bot maneja SU arquero (actor 1): se ubica entre pelota y arco
    const gk = s.actors[1];
    const targetX = clamp(s.ball.pos.x, GOAL_L + 3, GOAL_R - 3);
    const targetY = s.ball.shot ? clamp(s.ball.pos.y - 2, 3, 14) : 6;
    const o = seek(gk, { x: targetX, y: targetY }, true);
    return o;
  }

  // El bot ataca con el actor 1 (delantero)
  const st = s.actors[1];
  if (s.kind === "penalty") {
    if (s.t > 1.1 && s.ball.owner == null && !s.ball.shot) inp.action = true;
    return inp;
  }
  if (s.kind === "cross") {
    // Va a buscar el centro y cabecea cuando la pelota baja cerca
    const o = seek(st, { x: s.ball.pos.x, y: s.ball.pos.y + 2 }, true);
    if (dist(st.pos, s.ball.pos) < 6.5 && s.ball.z < 2.4 && s.ball.z > 0.1) o.action = true;
    return o;
  }
  // Con pelota: encara al arco con un zigzag leve; tira en rango
  if (s.ball.owner === 1) {
    const wob = Math.sin(s.t * (3 + mod(bot.control) * 2)) * 10;
    const o = seek(st, { x: clamp(50 + wob, 20, 80), y: 16 }, true);
    const range = 34 + mod(bot.shooting) * 8;
    if (st.pos.y < range && rnd() < (0.9 + mod(bot.shooting)) * 0.03) o.action = true;
    return o;
  }
  return seek(st, s.ball.pos, true);
}

/** IA de los actores secundarios (defensores/rival extra), sin input. */
function aiExtras(s: Scene, bot: TeamStats, dt: number) {
  for (let i = 0; i < s.actors.length; i++) {
    const a = s.actors[i];
    const controlled = i === 0 || i === 1; // 0 usuario, 1 lo lleva botInput
    if (controlled) continue;
    // Defensores: persiguen al dueño de la pelota (o la pelota)
    const target = s.ball.owner != null ? s.actors[s.ball.owner].pos : s.ball.pos;
    const inp: Input = {
      mx: (target.x - a.pos.x) / (dist(a.pos, target) || 1),
      my: (target.y - a.pos.y) / (dist(a.pos, target) || 1),
      sprint: true,
      action: false,
    };
    moveActor(a, inp, bot, dt, false);
    // Robo: si alcanza al que lleva la pelota, la escena termina sin gol
    if (s.ball.owner === 0 && dist(a.pos, s.actors[0].pos) < a.r + 2.2 && rnd() < 0.6 * dt * mod(bot.pace)) {
      s.done = { goal: false, text: "¡Te la robaron!" };
    }
  }
}

// ------------------------------------------------------------------
// Acciones (el botón contextual)
// ------------------------------------------------------------------
function shoot(s: Scene, shooterIdx: number, stats: TeamStats, aimDir: V | null) {
  const sh = s.actors[shooterIdx];
  s.ball.owner = null;
  s.ball.shot = true;
  // Dirección: joystick si empuja, sino al centro del arco
  let dx: number, dy: number;
  if (aimDir && (Math.abs(aimDir.x) > 0.25 || Math.abs(aimDir.y) > 0.25)) {
    dx = aimDir.x;
    dy = Math.min(-0.35, aimDir.y); // siempre hacia el arco
  } else {
    dx = (50 - sh.pos.x) / 60;
    dy = -1;
  }
  const d = Math.hypot(dx, dy) || 1;
  const power = 88 * mod(stats.power);
  // Ruido de puntería: crece con la distancia y baja con shooting
  const noise = (1.18 - mod(stats.shooting)) * (0.5 + sh.pos.y / 130) * (rnd() - 0.5) * 26;
  s.ball.vel = { x: (dx / d) * power + noise, y: (dy / d) * power };
}

function header(s: Scene, idx: number, stats: TeamStats) {
  // Timing del cabezazo: mejor cuanto más baja está la pelota
  const q = clamp(1.6 - s.ball.z, 0.2, 1);
  const a = s.actors[idx];
  s.ball.owner = null;
  s.ball.shot = true;
  s.ball.z = 0.6;
  s.ball.vz = 0;
  const dx = (50 - a.pos.x) / 40 + (rnd() - 0.5) * (1.3 - q) * 1.6 * (1.15 - mod(stats.shooting) + 0.15);
  const power = 66 * mod(stats.power) * (0.7 + q * 0.45);
  const d = Math.hypot(dx, -1) || 1;
  s.ball.vel = { x: (dx / d) * power, y: (-1 / d) * power };
}

function gkDive(a: Actor, inp: Input) {
  // Palomita: impulso fuerte en la dirección del joystick
  a.vel.x += inp.mx * 55;
  a.vel.y += inp.my * 30;
}

// ------------------------------------------------------------------
// Paso de simulación (puro: estado + inputs → estado)
// ------------------------------------------------------------------
export function step(
  m: MatchState,
  me: Input,
  rivalInp: Input,
  mine: TeamStats,
  bot: TeamStats,
  dt: number
) {
  const s = m.scene;
  if (m.finished || s.done) return;
  s.t += dt;

  const atkStats = s.attacking ? mine : bot;
  const defStats = s.attacking ? bot : mine;

  // --- mover al actor del usuario ---
  const meActor = s.actors[0];
  const meIsGk = !s.attacking;
  if (s.kind === "penalty" && s.attacking) {
    // Apuntar el penal: el joystick mueve la mira dentro del arco
    s.aim.x = clamp(s.aim.x + me.mx * 34 * dt, GOAL_L + 2, GOAL_R - 2);
    s.aim.y = clamp(s.aim.y + me.my * 20 * dt, 1, 9);
  } else {
    moveActor(meActor, me, mine, dt, meIsGk);
  }

  // --- mover al actor principal del rival ---
  const rvActor = s.actors[1];
  const rvIsGk = s.attacking;
  if (!(s.kind === "penalty" && !s.attacking)) {
    moveActor(rvActor, rivalInp, bot, dt, rvIsGk);
  }

  // --- acciones ---
  if (me.action) {
    if (meIsGk) gkDive(meActor, me);
    else if (s.kind === "penalty") {
      if (!s.ball.shot) {
        // Penal: la pelota sale hacia la mira con ruido por shooting
        const noise = (1.15 - mod(mine.shooting)) * (rnd() - 0.5) * 10;
        const dir = { x: s.aim.x + noise - s.ball.pos.x, y: s.aim.y - s.ball.pos.y };
        const d = Math.hypot(dir.x, dir.y) || 1;
        const p = 92 * mod(mine.power);
        s.ball.vel = { x: (dir.x / d) * p, y: (dir.y / d) * p };
        s.ball.shot = true;
        s.ball.owner = null;
      }
    } else if (s.ball.owner === 0) shoot(s, 0, mine, { x: me.mx, y: me.my });
    else if (s.kind === "cross" && s.attacking && dist(meActor.pos, s.ball.pos) < 6.5 && s.ball.z < 2.6)
      header(s, 0, mine);
    else if (!s.ball.shot && s.ball.owner === 1 && dist(meActor.pos, rvActor.pos) < 5) {
      // Barrida (solo tiene sentido si defendieras con jugador de campo; el GK ya tiene palomita)
      if (rnd() < 0.5 * mod(mine.pace)) s.done = { goal: false, text: "¡Gran quite!" };
    }
  }
  if (rivalInp.action) {
    if (rvIsGk) gkDive(rvActor, rivalInp);
    else if (s.kind === "penalty" && !s.ball.shot) {
      const noise = (1.15 - mod(bot.shooting)) * (rnd() - 0.5) * 12;
      const tx = GOAL_L + 4 + rnd() * (GOAL_R - GOAL_L - 8) + noise;
      const dir = { x: tx - s.ball.pos.x, y: 4 - s.ball.pos.y };
      const d = Math.hypot(dir.x, dir.y) || 1;
      const p = 92 * mod(bot.power);
      s.ball.vel = { x: (dir.x / d) * p, y: (dir.y / d) * p };
      s.ball.shot = true;
      s.ball.owner = null;
    } else if (s.ball.owner === 1) shoot(s, 1, bot, { x: rivalInp.mx, y: rivalInp.my });
    else if (s.kind === "cross" && !s.attacking && dist(rvActor.pos, s.ball.pos) < 6.5 && s.ball.z < 2.6)
      header(s, 1, bot);
  }

  // --- IA secundaria y pelota ---
  aiExtras(s, defStats, dt);
  moveBall(s.ball, s.actors, dt);

  // Recoger pelota suelta (centro que cae, rebote)
  if (s.ball.owner == null && !s.ball.shot && s.ball.z < 0.6) {
    for (const [i, a] of s.actors.entries()) {
      if (a.kind === "gk" || (i === 0 && meIsGk)) continue;
      if (dist(a.pos, s.ball.pos) < a.r + 1.6) {
        s.ball.owner = i;
        break;
      }
    }
  }

  // --- atajadas ---
  if (s.ball.shot) {
    const gk = s.attacking ? rvActor : meActor;
    const reach = gk.r + 2.4 + (s.attacking ? (mod(defStats.reflexes) - 0.85) * 6 : 0);
    if (s.ball.z < 2.2 && dist(gk.pos, s.ball.pos) < reach) {
      s.done = { goal: false, text: s.attacking ? "¡Te la atajó!" : "¡ATAJADÓN TUYO!" };
    }
  }

  // --- gol / afuera / timeout ---
  if (s.ball.pos.y <= 1.5 && !s.done) {
    const inMouth = s.ball.pos.x > GOAL_L && s.ball.pos.x < GOAL_R && s.ball.z < 3;
    s.done = inMouth
      ? { goal: true, text: "¡¡¡GOOOOL!!!" }
      : { goal: false, text: "Afuera…" };
  }
  if ((s.ball.pos.x < 0.5 || s.ball.pos.x > FIELD_W - 0.5 || s.ball.pos.y > FIELD_H - 1) && !s.done)
    s.done = { goal: false, text: "Se fue…" };
  if (s.t > SCENE_TIME && !s.done)
    s.done = { goal: false, text: "Se acabó el tiempo de la jugada" };

  // --- cierre de jugada ---
  if (s.done) {
    if (s.done.goal) {
      if (s.attacking) m.myGoals++;
      else m.rivalGoals++;
    }
  }
}

/** Pasa a la siguiente jugada (la llama la vista tras mostrar el cartel). */
export function nextPlay(m: MatchState) {
  if (m.play >= TOTAL_PLAYS) {
    m.finished = true;
    return;
  }
  m.play++;
  const attacking = m.play % 2 === 1;
  m.scene = makeScene(randKind(), attacking);
}
