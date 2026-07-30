"use client";

/**
 * LABORATORIO PvP — vista (prototipo aislado, no toca nada del juego)
 *
 * Flujo completo del reto con apuesta (simulado contra un bot):
 * elegir apuesta → enviar desafío → el rival acepta → cuenta regresiva
 * 3-2-1 → partido de 8 jugadas → resultado con pozo. Para el online
 * real, los pasos "enviar/aceptar/bloquear monedas" se cablean a
 * Supabase (el motor ya recibe inputs simétricos por tick).
 */

import { useEffect, useRef, useState } from "react";
import { Coins, Swords, Gamepad2, Zap, RotateCcw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { reportArcade } from "./actions";
import {
  step,
  botInput,
  newMatch,
  nextPlay,
  NO_INPUT,
  FIELD_W,
  FIELD_H,
  TOTAL_PLAYS,
  type Input,
  type MatchState,
  type TeamStats,
} from "./engine";

// Equipos de prueba (después salen de las cartas reales)
const MY_TEAM: TeamStats = { pace: 78, shooting: 76, control: 77, power: 79, reflexes: 75 };
const BOT_TEAM: TeamStats = { pace: 76, shooting: 75, control: 74, power: 76, reflexes: 77 };
const STAKES = [0, 100, 250, 500, 1000, 2500];

type Phase = "lobby" | "waiting" | "countdown" | "playing" | "between" | "result";

export function PvpLabView({
  rating,
  division,
  played,
  won: wonCount,
  top,
}: {
  rating: number;
  division: number;
  played: number;
  won: number;
  top: { club_name: string; rating: number }[];
}) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [stake, setStake] = useState(250);
  const [count, setCount] = useState(3);
  const [banner, setBanner] = useState<string | null>(null);
  const [, force] = useState(0);

  const matchRef = useRef<MatchState>(newMatch());
  const reportedRef = useRef(false);
  const [delta, setDelta] = useState<number | null>(null);
  const inputRef = useRef<Input>({ ...NO_INPUT });
  const actionEdge = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("lobby");
  phaseRef.current = phase;

  // ---- Flujo del reto ----
  function sendChallenge() {
    setPhase("waiting");
    // El bot "acepta" al toque; online: acá se espera la confirmación real
    setTimeout(() => {
      matchRef.current = newMatch();
      setCount(3);
      setPhase("countdown");
    }, 1400);
  }

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      setBanner(matchRef.current.scene.banner);
      setPhase("playing");
      setTimeout(() => setBanner(null), 1500);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count]);

  // ---- Bucle de juego ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const m = matchRef.current;

      if (phaseRef.current === "playing" && !m.scene.done) {
        const me: Input = { ...inputRef.current, action: actionEdge.current };
        actionEdge.current = false;
        step(m, me, botInput(m, BOT_TEAM), MY_TEAM, BOT_TEAM, dt);
        // step() muta el estado: anotamos el tipo para que TS no arrastre
        // el narrowing previo de m.scene.done
        const finished = m.scene.done as { goal: boolean; text: string } | null;
        if (finished) {
          setBanner(finished.text);
          setTimeout(() => {
            nextPlay(m);
            if (m.finished) {
              setPhase("result");
              if (!reportedRef.current) {
                reportedRef.current = true;
                reportArcade(m.myGoals, m.rivalGoals).then((r) => {
                  if (r.ok && typeof r.delta === "number") setDelta(r.delta);
                });
              }
            }
            else {
              setBanner(m.scene.banner);
              setTimeout(() => setBanner(null), 1400);
            }
            force((x) => x + 1);
          }, 1300);
        }
        force((x) => x + 1);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Teclado (PC) ----
  useEffect(() => {
    const keys = new Set<string>();
    const apply = () => {
      const i = inputRef.current;
      i.mx = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      i.my = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
      i.sprint = keys.has("Shift");
    };
    const down = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "x") actionEdge.current = true;
      keys.add(e.key);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key);
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---- Render del canvas ----
  function draw() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width;
    const H = cv.height;
    const sx = W / FIELD_W;
    const sy = H / FIELD_H;
    const P = (x: number, y: number) => [x * sx, y * sy] as const;

    // Césped con franjas
    ctx.fillStyle = "#0c7a43";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 8; i += 2) ctx.fillRect(0, (H / 8) * i, W, H / 8);

    // Área y arco (arriba)
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(...P(24, 0), 52 * sx, 26 * sy);
    ctx.strokeRect(...P(38, 0), 24 * sx, 10 * sy);
    ctx.beginPath();
    ctx.arc(...P(50, 26), 8 * sx, 0, Math.PI);
    ctx.stroke();
    // Red
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(...P(35, -0.5), 30 * sx, 2.4 * sy);
    ctx.fillStyle = "#fff";
    ctx.fillRect(...P(34.4, 0), 1 * sx, 2.6 * sy);
    ctx.fillRect(...P(64.6, 0), 1 * sx, 2.6 * sy);

    const m = matchRef.current;
    const s = m.scene;

    // Mira del penal
    if (s.kind === "penalty" && s.attacking && !s.ball.shot && !s.done) {
      const [ax, ay] = P(s.aim.x, s.aim.y);
      ctx.strokeStyle = "#ffe14d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.moveTo(ax - 13, ay);
      ctx.lineTo(ax + 13, ay);
      ctx.moveTo(ax, ay - 13);
      ctx.lineTo(ax, ay + 13);
      ctx.stroke();
    }

    // Actores (sombra + camiseta)
    for (const [i, a] of s.actors.entries()) {
      const [x, y] = P(a.pos.x, a.pos.y);
      const r = a.r * sx;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.55, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      const isMe = i === 0;
      const isGk = a.kind === "gk" || (!s.attacking && i === 0);
      ctx.fillStyle = isMe ? "#2dd4bf" : isGk ? "#f59e0b" : "#ef4444";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isMe ? "#eafffb" : "rgba(0,0,0,0.35)";
      ctx.stroke();
      if (isMe) {
        // Flechita "sos vos"
        ctx.fillStyle = "#eafffb";
        ctx.beginPath();
        ctx.moveTo(x, y - r - 10);
        ctx.lineTo(x - 5, y - r - 3);
        ctx.lineTo(x + 5, y - r - 3);
        ctx.fill();
      }
    }

    // Pelota (con altura)
    const b = s.ball;
    const [bx, by] = P(b.pos.x, b.pos.y);
    const lift = b.z * 7;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(bx, by + 3, 4.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bx, by - lift, 4.5 + b.z * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.stroke();
  }

  // ---- Joystick táctil ----
  const stickBase = useRef<{ x: number; y: number } | null>(null);
  const [stickUi, setStickUi] = useState<{ bx: number; by: number; dx: number; dy: number } | null>(null);

  function stickStart(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stickBase.current = { x: e.clientX, y: e.clientY };
    setStickUi({ bx: e.clientX, by: e.clientY, dx: 0, dy: 0 });
  }
  function stickMove(e: React.PointerEvent) {
    if (!stickBase.current) return;
    const dx = e.clientX - stickBase.current.x;
    const dy = e.clientY - stickBase.current.y;
    const d = Math.hypot(dx, dy);
    const max = 44;
    const k = d > max ? max / d : 1;
    inputRef.current.mx = (dx * k) / max;
    inputRef.current.my = (dy * k) / max;
    setStickUi({ bx: stickBase.current.x, by: stickBase.current.y, dx: dx * k, dy: dy * k });
  }
  function stickEnd() {
    stickBase.current = null;
    inputRef.current.mx = 0;
    inputRef.current.my = 0;
    setStickUi(null);
  }

  const m = matchRef.current;
  const pot = stake * 2;
  const won = m.myGoals > m.rivalGoals;
  const draw2 = m.myGoals === m.rivalGoals;

  return (
    <div className="space-y-3">
      {/* ---- LOBBY ---- */}
      {phase === "lobby" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-[10px] uppercase text-muted">Rating</p>
              <p className="font-display text-lg font-extrabold text-turf">{rating}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-[10px] uppercase text-muted">División</p>
              <p className="font-display text-lg font-extrabold text-trophy">{division}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-2">
              <p className="text-[10px] uppercase text-muted">Ganados</p>
              <p className="font-display text-lg font-extrabold">{wonCount}/{played}</p>
            </div>
          </div>
          {top.length > 0 && (
            <div className="space-y-1 rounded-2xl border border-border bg-surface p-3">
              <p className="text-xs font-bold text-muted">Ranking</p>
              {top.map((t, i) => (
                <p key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-center font-display font-extrabold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{t.club_name}</span>
                  <span className="font-bold tabular-nums text-turf">{t.rating}</span>
                </p>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Gamepad2 size={20} className="text-turf" /> Laboratorio PvP
            </p>
            <p className="mt-1 text-sm text-muted">
              Prototipo del nuevo PvP arcade: 8 jugadas cortas (4 atacás, 4
              defendés). Joystick para moverte, un botón de acción que cambia
              según el contexto. Acá jugás contra un bot con stats de cartas;
              el flujo de reto y apuesta es el definitivo.
            </p>
          </div>

          <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-muted">Apuesta (demo, no toca tu saldo)</p>
            <div className="flex flex-wrap gap-2">
              {STAKES.map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-bold",
                    stake === v
                      ? "border-trophy bg-trophy/15 text-trophy"
                      : "border-border text-muted"
                  )}
                >
                  {v === 0 ? "Amistoso" : v.toLocaleString("es")}
                </button>
              ))}
            </div>
            <Button fullWidth size="lg" onClick={sendChallenge}>
              <Swords size={17} /> Enviar desafío
            </Button>
            <p className="text-[10px] text-muted">
              Flujo real: el rival recibe la invitación y puede aceptar o
              rechazar. Recién cuando acepta se bloquean las monedas de los
              dos y arranca la cuenta regresiva. Abandonar o desconectarse sin
              volver = derrota automática y el pozo va al rival.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted">
            <p className="font-semibold text-text">Controles</p>
            <p>📱 Joystick (mitad izquierda) · ⚡ Sprint · 🎯 Acción (tiro / cabezazo / palomita)</p>
            <p>💻 WASD o flechas · Shift sprint · Espacio o X acción</p>
          </div>
        </div>
      )}

      {/* ---- ESPERANDO RIVAL ---- */}
      {phase === "waiting" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8">
          <Swords size={28} className="animate-pulse text-turf" />
          <p className="font-display text-lg font-extrabold">Desafío enviado…</p>
          <p className="text-sm text-muted">
            Esperando que el rival acepte
            {stake > 0 ? ` la apuesta de ${stake.toLocaleString("es")}` : ""}.
          </p>
        </div>
      )}

      {/* ---- JUEGO ---- */}
      {(phase === "playing" || phase === "countdown" || phase === "between") && (
        <div className="space-y-2">
          {/* Marcador */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
            <span className="text-xs font-bold text-turf">VOS</span>
            <span className="font-display text-xl font-extrabold tabular-nums">
              {m.myGoals} — {m.rivalGoals}
            </span>
            <span className="text-xs font-bold text-danger">RIVAL</span>
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-muted">
            <span>Jugada {Math.min(m.play, TOTAL_PLAYS)}/{TOTAL_PLAYS}</span>
            {stake > 0 && (
              <span className="flex items-center gap-1 font-bold text-trophy">
                <Coins size={11} /> Pozo {pot.toLocaleString("es")}
              </span>
            )}
          </div>

          {/* Cancha */}
          <div
            className="relative touch-none select-none overflow-hidden rounded-2xl border border-border"
            style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}`, maxHeight: "62vh", margin: "0 auto" }}
          >
            <canvas ref={canvasRef} width={400} height={640} className="h-full w-full" />

            {/* Cuenta regresiva */}
            {phase === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="font-display text-7xl font-extrabold text-white">
                  {count === 0 ? "¡YA!" : count}
                </span>
              </div>
            )}

            {/* Cartel de jugada */}
            {banner && phase === "playing" && (
              <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
                <span className="rounded-xl bg-black/70 px-4 py-2 font-display text-lg font-extrabold text-white">
                  {banner}
                </span>
              </div>
            )}

            {/* Zona táctil del joystick: mitad izquierda */}
            <div
              className="absolute inset-y-0 left-0 w-1/2"
              onPointerDown={stickStart}
              onPointerMove={stickMove}
              onPointerUp={stickEnd}
              onPointerCancel={stickEnd}
            />
            {stickUi && (
              <div
                className="pointer-events-none fixed z-50"
                style={{ left: stickUi.bx - 44, top: stickUi.by - 44 }}
              >
                <div className="h-[88px] w-[88px] rounded-full border-2 border-white/40 bg-white/10">
                  <div
                    className="h-10 w-10 rounded-full bg-white/70"
                    style={{ transform: `translate(${24 + stickUi.dx}px, ${24 + stickUi.dy}px)` }}
                  />
                </div>
              </div>
            )}

            {/* Botones: sprint + acción */}
            <div className="absolute bottom-4 right-3 flex flex-col items-center gap-3">
              <button
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/40 bg-white/15 text-white active:bg-white/30"
                onPointerDown={() => (inputRef.current.sprint = true)}
                onPointerUp={() => (inputRef.current.sprint = false)}
                onPointerCancel={() => (inputRef.current.sprint = false)}
              >
                <Zap size={20} />
              </button>
              <button
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-turf bg-turf/80 font-display text-sm font-extrabold text-white active:scale-95"
                onPointerDown={() => (actionEdge.current = true)}
              >
                GO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- RESULTADO ---- */}
      {phase === "result" && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-display text-2xl font-extrabold">
            {draw2 ? "Empate" : won ? "¡VICTORIA!" : "Derrota"}
          </p>
          <p className="font-display text-4xl font-extrabold tabular-nums">
            {m.myGoals} — {m.rivalGoals}
          </p>
          {stake > 0 && !draw2 && (
            <p className={cn("flex items-center justify-center gap-1 text-lg font-bold", won ? "text-trophy" : "text-danger")}>
              <Coins size={16} />
              {won ? `+${pot.toLocaleString("es")}` : `-${stake.toLocaleString("es")}`}
            </p>
          )}
          {delta !== null && (
            <p className="text-sm font-bold text-muted">
              Rating: {delta > 0 ? "+" : ""}{delta}
            </p>
          )}
          {draw2 && stake > 0 && (
            <p className="text-sm text-muted">Empate: cada uno recupera su apuesta.</p>
          )}
          <Button
            fullWidth
            onClick={() => {
              matchRef.current = newMatch();
              reportedRef.current = false;
              setDelta(null);
              setPhase("lobby");
            }}
          >
            <RotateCcw size={15} /> Jugar de nuevo
          </Button>
        </div>
      )}
    </div>
  );
}
