"use client";

/**
 * DUELO DE CARTAS — vista
 *
 * Sincronización: el estado vive 100% en el servidor (ver migración
 * 0043). El cliente lo refresca con un sondeo corto (1.8s) mientras la
 * partida está viva + refresco inmediato tras cada acción propia. Con
 * turnos de 15s eso se siente en vivo y es imposible de desincronizar:
 * lo que dice el servidor ES la partida.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Swords,
  Coins,
  Timer,
  Check,
  Copy,
  Flag as FlagIcon,
  Layers,
  Search,
  KeyRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { Portrait } from "@/components/player-card/portrait";
import {
  searchDuel,
  createRoom,
  joinCode,
  cancelSearch,
  pickCard,
  tickMatch,
  forfeitMatch,
  fetchState,
  type DuelState,
  type DuelCard,
} from "./actions";

const STAT_LABEL: Record<string, string> = {
  pace: "Velocidad",
  shooting: "Tiro",
  passing: "Pase",
  dribbling: "Regate",
  defending: "Defensa",
  physical: "Físico",
};
const STAT_SHORT: Record<string, string> = {
  pace: "VEL",
  shooting: "TIR",
  passing: "PAS",
  dribbling: "REG",
  defending: "DEF",
  physical: "FIS",
};
const STATS = ["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const;
const STAKES = [0, 100, 250, 500, 1000, 2500];

function catLabel(cat: string[] | null | undefined) {
  if (!cat) return "";
  return cat.map((k) => STAT_LABEL[k] ?? k).join(" + ");
}

export function DuelCardsView({ initialMatchId }: { initialMatchId: string | null }) {
  const router = useRouter();
  const [matchId, setMatchId] = useState<string | null>(initialMatchId);
  const [state, setState] = useState<DuelState | null>(null);
  const stateRef = useRef<DuelState | null>(null);
  const [stake, setStake] = useState(0);
  const [codeInput, setCodeInput] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastRoundShown = useRef(0);
  const [reveal, setReveal] = useState<DuelState["rounds"][number] | null>(null);

  // ---- Sondeo del estado ----
  const refresh = useCallback(async () => {
    if (!matchId) return;
    const s = await fetchState(matchId);
    if (!s) return;
    setState(s);
    stateRef.current = s;
    setSecondsLeft(s.seconds_left);
    // Nueva ronda resuelta → mostrar la revelación un momento
    const lastLog = s.rounds[s.rounds.length - 1];
    if (lastLog && lastLog.round > lastRoundShown.current) {
      lastRoundShown.current = lastLog.round;
      setReveal(lastLog);
      setSelected(null);
      setTimeout(() => setReveal(null), 3200);
    }
  }, [matchId]);

  // Sondeo adaptativo: solo se consulta seguido cuando de verdad
  // esperamos algo del rival. Si ya jugamos nuestra carta, el rival
  // tiene hasta 15 s, así que mirar cada 2 s alcanza; si todavía no
  // elegimos, el estado no puede cambiar solo y basta con 6 s. Con la
  // partida terminada o la pestaña oculta, no se consulta nada.
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await refresh();
      if (!alive) return;
      const st = stateRef.current;
      const stopped =
        st && (st.status === "done" || st.status === "cancelled");
      if (stopped) return;
      const waitingRival = st?.status === "active" && st.my_pick !== null;
      const wait =
        document.visibilityState !== "visible"
          ? 15_000
          : st?.status === "waiting"
            ? 5_000
            : waitingRival
              ? 2_000
              : 6_000;
      timer = setTimeout(loop, wait);
    };

    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [matchId, refresh]);

  // Reloj local (entre sondeos) + aviso al servidor cuando vence.
  //
  // Antes esto era un bucle: al llegar a 0 se llamaba a tickMatch y a
  // refresh, y si el servidor devolvía 0 otra vez (porque el rival
  // todavía no había resuelto), volvía a dispararse sin freno. Ahora
  // se avisa UNA sola vez por ronda.
  const tickedRound = useRef(-1);
  useEffect(() => {
    if (secondsLeft === null || !matchId) return;
    if (secondsLeft <= 0) {
      const round = stateRef.current?.round ?? -1;
      if (tickedRound.current !== round) {
        tickedRound.current = round;
        tickMatch(matchId).then(refresh);
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, matchId, refresh]);

  // ---- Acciones ----
  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
    setError(null);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo.");
      return null;
    }
    return res.data as { match_id?: string; code?: string } | undefined;
  }

  async function onSearch() {
    const d = await run(() => searchDuel(stake));
    if (d?.match_id) setMatchId(d.match_id);
  }
  async function onCreateRoom() {
    const d = await run(() => createRoom(stake));
    if (d?.match_id) setMatchId(d.match_id);
  }
  async function onJoin() {
    if (!codeInput.trim()) return;
    const d = await run(() => joinCode(codeInput));
    if (d?.match_id) setMatchId(d.match_id);
  }
  async function onCancel() {
    await cancelSearch();
    setMatchId(null);
    setState(null);
  }
  async function onPick() {
    if (!matchId || selected === null) return;
    const res = await pickCard(matchId, selected);
    if (!res.ok) setError(res.error ?? "");
    await refresh();
  }
  async function onForfeit() {
    if (!matchId) return;
    if (!confirm("Abandonar cuenta como derrota y el rival se lleva el pozo. ¿Seguro?")) return;
    await forfeitMatch(matchId);
    await refresh();
  }
  function backToLobby() {
    setMatchId(null);
    setState(null);
    setSelected(null);
    lastRoundShown.current = 0;
    router.refresh();
  }

  // ================= LOBBY =================
  if (!matchId || !state || state.status === "cancelled") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Layers size={20} className="text-turf" /> Duelo de Cartas
          </p>
          <p className="mt-1 text-sm text-muted">
            10 rondas. En cada una sale una categoría (ej: Velocidad + Tiro)
            y los dos eligen en secreto una carta de sus 10 de campo. Gana la
            ronda la suma más alta. Cada carta se usa una sola vez.
          </p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-muted">Apuesta</p>
          <div className="flex flex-wrap gap-2">
            {STAKES.map((v) => (
              <button
                key={v}
                onClick={() => setStake(v)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-bold",
                  stake === v ? "border-trophy bg-trophy/15 text-trophy" : "border-border text-muted"
                )}
              >
                {v === 0 ? "Amistoso" : v.toLocaleString("es")}
              </button>
            ))}
          </div>
          <Button fullWidth size="lg" disabled={busy} onClick={onSearch}>
            <Search size={16} /> Buscar partida
          </Button>
          <Button fullWidth variant="secondary" disabled={busy} onClick={onCreateRoom}>
            <Swords size={16} /> Crear sala privada
          </Button>
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              maxLength={5}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center font-display text-lg font-extrabold tracking-widest"
            />
            <Button variant="secondary" disabled={busy || codeInput.length < 5} onClick={onJoin}>
              <KeyRound size={15} /> Entrar
            </Button>
          </div>
          <p className="text-[10px] text-muted">
            Ambos bloquean la apuesta al emparejarse. Abandonar = derrota.
            Empate: desempata la suma total de la partida; si sigue igual,
            se devuelven las monedas.
          </p>
        </div>
      </div>
    );
  }

  // ================= ESPERANDO RIVAL =================
  if (state.status === "waiting") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
          <Swords size={28} className="animate-pulse text-turf" />
          <p className="font-display text-lg font-extrabold">Esperando rival…</p>
          {state.code && (
            <button
              onClick={() => navigator.clipboard?.writeText(state.code!)}
              className="flex items-center gap-2 rounded-xl border border-trophy/50 bg-trophy/10 px-4 py-2 font-display text-2xl font-extrabold tracking-widest text-trophy"
            >
              {state.code} <Copy size={16} />
            </button>
          )}
          <p className="text-xs text-muted">
            {state.code
              ? "Pasale el código a tu rival para que entre."
              : `Buscando rival con apuesta de ${state.stake.toLocaleString("es")}…`}
          </p>
          <Button variant="secondary" onClick={onCancel}>
            <X size={15} /> Cancelar (devuelve la apuesta)
          </Button>
        </div>
      </div>
    );
  }

  // ================= FINAL =================
  if (state.status === "done") {
    const won = state.winner === "me";
    const drawn = state.winner === null;
    const pot = state.stake * 2;
    return (
      <div className="space-y-3">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-display text-2xl font-extrabold">
            {drawn ? "Empate" : won ? "¡VICTORIA!" : "Derrota"}
          </p>
          <p className="font-display text-4xl font-extrabold tabular-nums">
            {state.my_score} — {state.rival_score}
          </p>
          <p className="text-xs text-muted">vos · {state.rival_name ?? "rival"}</p>
          {state.stake > 0 && !drawn && (
            <p className={cn("flex items-center justify-center gap-1 text-lg font-bold", won ? "text-trophy" : "text-danger")}>
              <Coins size={16} />
              {won ? `+${Math.floor(pot * 0.95).toLocaleString("es")}` : `-${state.stake.toLocaleString("es")}`}
            </p>
          )}
          {drawn && state.stake > 0 && (
            <p className="text-sm text-muted">Apuestas devueltas.</p>
          )}
          <Button fullWidth onClick={backToLobby}>Volver</Button>
        </div>

        {/* Resumen ronda a ronda */}
        <div className="space-y-1.5 rounded-2xl border border-border bg-surface p-3">
          <p className="text-xs font-bold text-muted">Ronda a ronda</p>
          {state.rounds.map((r) => {
            const mine = state.my_side === "p1" ? r.p1 : r.p2;
            const theirs = state.my_side === "p1" ? r.p2 : r.p1;
            const iWon = r.winner === state.my_side;
            return (
              <p key={r.round} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center font-display font-extrabold">{r.round}</span>
                <span className="w-24 shrink-0 truncate text-muted">{catLabel(r.category)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {mine.card.name} <b>{mine.total}</b> vs {theirs.total} {theirs.card.name}
                </span>
                <span className={cn("font-bold", r.winner === "tie" ? "text-muted" : iWon ? "text-turf" : "text-danger")}>
                  {r.winner === "tie" ? "=" : iWon ? "✓" : "✗"}
                </span>
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  // ================= PARTIDA =================
  const cards = (state.my_cards ?? []) as DuelCard[];
  const used = new Set(state.my_used);
  const picked = state.my_pick !== null;

  return (
    <div className="space-y-2.5">
      {/* Marcador + ronda + reloj */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-turf">VOS</span>
        <span className="font-display text-xl font-extrabold tabular-nums">
          {state.my_score} — {state.rival_score}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-danger">
          {state.rival_name ?? "RIVAL"}
        </span>
      </div>
      <div className="flex items-center justify-between px-1 text-[11px]">
        <span className="text-muted">Ronda {state.round}/10</span>
        {state.stake > 0 && (
          <span className="flex items-center gap-1 font-bold text-trophy">
            <Coins size={11} /> {(state.stake * 2).toLocaleString("es")}
          </span>
        )}
        <span
          className={cn(
            "flex items-center gap-1 font-display text-base font-extrabold tabular-nums",
            (secondsLeft ?? 99) <= 5 ? "text-danger" : "text-text"
          )}
        >
          <Timer size={13} /> {Math.max(0, Math.min(15, secondsLeft ?? 0))}s
        </span>
      </div>

      {/* Categoría */}
      <div className="rounded-2xl border border-turf/50 bg-turf-soft/25 px-4 py-3 text-center">
        <p className="eyebrow">Categoría</p>
        <p className="font-display text-xl font-extrabold text-turf">
          🔥 {catLabel(state.category)}
        </p>
        <p className="text-[10px] text-muted">
          {picked
            ? state.rival_picked
              ? "Resolviendo…"
              : "Listo. Esperando al rival…"
            : "Elegí la carta con la suma más alta en esas stats"}
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* Revelación de la ronda anterior */}
      {reveal && (
        <div className="animate-scale-in space-y-1 rounded-2xl border border-trophy/50 bg-surface p-3 text-center">
          <p className="text-[10px] uppercase text-muted">
            Ronda {reveal.round} · {catLabel(reveal.category)}
          </p>
          {(() => {
            const mine = state.my_side === "p1" ? reveal.p1 : reveal.p2;
            const theirs = state.my_side === "p1" ? reveal.p2 : reveal.p1;
            const iWon = reveal.winner === state.my_side;
            return (
              <>
                <p className="text-sm font-bold">
                  {mine.card.name} <span className="text-turf">{mine.total}</span>
                  <span className="mx-1 text-muted">vs</span>
                  <span className="text-danger">{theirs.total}</span> {theirs.card.name}
                </p>
                <p className={cn("font-display text-lg font-extrabold", reveal.winner === "tie" ? "text-muted" : iWon ? "text-turf" : "text-danger")}>
                  {reveal.winner === "tie" ? "Empate de ronda" : iWon ? "¡Ronda tuya!" : "Ronda del rival"}
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* Mano: 10 cartas con TODAS las stats visibles */}
      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((c, i) => {
          const isUsed = used.has(i);
          const isSel = selected === i;
          const total = (state.category ?? []).reduce(
            (s, k) => s + ((c.attrs as unknown as Record<string, number>)[k] ?? 0),
            0
          );
          return (
            <button
              key={i}
              disabled={isUsed || picked || busy}
              onClick={() => setSelected(isSel ? null : i)}
              className={cn(
                "rounded-xl border p-2 text-left transition",
                isUsed
                  ? "border-border bg-surface opacity-35"
                  : isSel
                    ? "border-turf bg-turf-soft/25"
                    : "border-border bg-surface"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Portrait name={c.name} size={22} className="shrink-0 bg-bg" />
                <span className="font-display text-base font-extrabold">{c.overall}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {c.name}
                </span>
                {isUsed && <Check size={12} className="shrink-0 text-muted" />}
              </span>
              <span className="mt-1 grid grid-cols-3 gap-x-1 text-[9px] leading-tight">
                {STATS.map((k) => {
                  const inCat = state.category?.includes(k);
                  return (
                    <span
                      key={k}
                      className={cn(inCat ? "font-extrabold text-turf" : "text-muted")}
                    >
                      {STAT_SHORT[k]}{" "}
                      {(c.attrs as unknown as Record<string, number>)[k] ?? 0}
                    </span>
                  );
                })}
              </span>
              {!isUsed && state.category && (
                <span className={cn("mt-0.5 block text-right text-[10px] font-bold", isSel ? "text-turf" : "text-muted")}>
                  Σ {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Confirmar / abandonar */}
      <Button fullWidth size="lg" disabled={picked || selected === null || busy} onClick={onPick}>
        {picked ? "Carta jugada" : selected === null ? "Elegí una carta" : "Confirmar carta"}
      </Button>
      <button
        onClick={onForfeit}
        className="mx-auto flex items-center gap-1 text-[11px] text-muted underline"
      >
        <FlagIcon size={11} /> Abandonar partida
      </button>
    </div>
  );
}
