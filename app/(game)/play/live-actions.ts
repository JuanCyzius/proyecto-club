"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  advance,
  applyDecision,
  applySub,
  createLiveMatch,
  finalResult,
  publicView,
  staminaDrops,
  setMentality,
  type Decision,
  type LiveState,
  type PublicMatchView,
} from "@/lib/sim/live";
import type { MatchEvent } from "@/lib/sim/types";
import { buildHomeTeam, buildAiTeam } from "./build-teams";

export type LiveTurn = {
  ok: true;
  matchId: string;
  events: MatchEvent[];
  view: PublicMatchView;
  decision: Decision | null;
  finished: boolean;
  reward?: number | null;
};
export type LiveError = { ok: false; error: string };
export type LiveResult = LiveTurn | LiveError;

type LoadedLive =
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      admin: ReturnType<typeof createAdminClient>;
      state: LiveState;
    };

/** Carga el estado del partido validando que sea del usuario y esté vivo. */
async function loadLive(matchId: string): Promise<LoadedLive> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("matches")
    .select("id, home_user, live_state, is_live, competition, log")
    .eq("id", matchId)
    .maybeSingle();

  if (!data) return { ok: false, error: "Partido no encontrado." };
  if (data.home_user !== user.id) return { ok: false, error: "No es tu partido." };
  if (!data.is_live || !data.live_state)
    return { ok: false, error: "Ese partido ya terminó." };

  return {
    ok: true,
    userId: user.id,
    admin,
    state: data.live_state as unknown as LiveState,
  };
}

/** Guarda el estado y, si terminó, escribe el resultado y paga la recompensa. */
async function persist(
  admin: ReturnType<typeof createAdminClient>,
  matchId: string,
  state: LiveState,
  finished: boolean
): Promise<number | null> {
  if (!finished) {
    await admin
      .from("matches")
      .update({ live_state: state as unknown as object })
      .eq("id", matchId);
    return null;
  }

  const result = finalResult(state);
  // Se relee el log para conservar el parte de equipos guardado al crear
  const { data: prev } = await admin
    .from("matches")
    .select("log")
    .eq("id", matchId)
    .maybeSingle();

  await admin
    .from("matches")
    .update({
      is_live: false,
      live_state: null,
      status: "done",
      home_score: result.homeScore,
      away_score: result.awayScore,
      winner: result.winner,
      played_at: new Date().toISOString(),
      log: {
        // Se conserva el parte de equipos guardado al crear el partido
        ...((prev?.log as Record<string, unknown>) ?? {}),
        events: result.events,
        stats: result.stats,
        ratings: result.ratings,
        wentToPenalties: result.wentToPenalties,
        penalties: result.penalties ?? null,
      },
    })
    .eq("id", matchId);

  const supabase = createClient();

  // Persistir el desgaste de estamina de las cartas que jugaron.
  const { cardIds, drops } = staminaDrops(state);
  if (cardIds.length > 0) {
    await supabase.rpc("apply_match_stamina", {
      p_card_ids: cardIds,
      p_drops: drops,
    });
    // Descontar lesiones existentes y sortear nuevas.
    await supabase.rpc("apply_match_injuries", { p_card_ids: cardIds });
    await supabase.rpc("apply_match_reds", { p_card_ids: cardIds });
  }

  // Recompensa (RPC idempotente).
  const { data: reward } = await supabase.rpc("grant_match_reward", {
    p_match_id: matchId,
  });
  return reward != null ? Number(reward) : null;
}

/** Crea el partido y devuelve el primer tramo. */
/**
 * Empieza un partido contra un rival SORTEADO dentro de la franja elegida.
 * El sorteo lo hace el servidor: el cliente no elige el club.
 */

/** Segundos que espera el servidor antes de decidir por el usuario. */
const DECISION_SECONDS = 7;

/**
 * Pone al día un partido que quedó corriendo mientras el usuario no
 * miraba: resuelve solas las decisiones que llevan más de 7 segundos
 * y avanza hasta la próxima parada vigente (o el final). Así se puede
 * ir al chat y volver sin perder el partido.
 */
function catchUp(state: LiveState): {
  state: LiveState;
  events: MatchEvent[];
  decision: Decision | null;
  finished: boolean;
} {
  const events: MatchEvent[] = [];
  let decision: Decision | null = state.pending ?? null;
  let finished = false;
  let guard = 0;

  // Si nunca se marcó el inicio de la espera, se marca ahora.
  if (decision && !state.pendingSince) state.pendingSince = Date.now();

  while (guard++ < 60) {
    const pend = state.pending;
    if (!pend) break;
    const since = state.pendingSince ?? Date.now();
    if (Date.now() - since < DECISION_SECONDS * 1000) break;

    // Se vencío el tiempo: elige la primera opción (la más conservadora)
    const applied = applyDecision(state, pend.options[0].id);
    events.push(...applied.newEvents);
    const res = advance(state);
    events.push(...res.newEvents);
    decision = res.decision;
    finished = res.finished;
    state.pendingSince = res.decision ? Date.now() : null;
    if (finished) break;
  }

  if (!state.pending) {
    // Sin decisión pendiente: se avanza normalmente
    const res = advance(state);
    events.push(...res.newEvents);
    decision = res.decision;
    finished = res.finished;
    if (res.decision && !state.pendingSince) state.pendingSince = Date.now();
  }

  return { state, events, decision, finished };
}

export async function startLiveMatch(tierCode: string): Promise<LiveResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const home = await buildHomeTeam(supabase, user.id);
  if ("error" in home) return { ok: false, error: home.error };

  const { data: drawn, error: drawErr } = await supabase.rpc(
    "random_opponent",
    { p_tier: tierCode }
  );
  if (drawErr) {
    const msg = (drawErr.message ?? "").toLowerCase();
    if (msg.includes("could not find") || msg.includes("does not exist")) {
      return {
        ok: false,
        error: "Falta ejecutar la migración 0020_random_opponents.sql.",
      };
    }
    return { ok: false, error: "No se pudo sortear un rival." };
  }
  const ai = (drawn as any[])?.[0];
  if (!ai) return { ok: false, error: "No hay rivales en esa dificultad." };

  const away = await buildAiTeam(supabase, ai);
  const seed = `${ai.id}-${user.id}-${Date.now()}-${Math.floor(
    Math.random() * 1e9
  ).toString(16)}`;

  const state = createLiveMatch({
    home: home.team,
    away,
    seed,
    competition: "friendly",
  });

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("matches")
    .insert({
      home_user: user.id,
      ai_opponent: ai.id,
      kind: "ai",
      competition: "friendly",
      seed,
      status: "live",
      is_live: true,
      home_name: home.team.name,
      away_name: away.name,
      live_state: state as unknown as object,
      // Parte de equipos: media, química y once de ambos, para mostrarlo
      // antes y después del partido.
      log: {
        teams: {
          home: {
            name: home.team.name,
            avgOverall: home.team.avgOverall ?? null,
            chemistry: home.team.chemistry ?? null,
            starters: home.team.starters.map((p) => ({
              name: p.name,
              position: p.position,
              slotPos: p.slotPos,
              overall: p.overall,
            })),
          },
          away: {
            name: away.name,
            avgOverall: away.avgOverall ?? null,
            chemistry: away.chemistry ?? 100,
            starters: away.starters.map((p) => ({
              name: p.name,
              position: p.position,
              slotPos: p.slotPos,
              overall: p.overall,
            })),
          },
        },
      },
    })
    .select("id")
    .single();

  if (error || !inserted)
    return { ok: false, error: "No se pudo crear el partido." };

  const res = advance(state);
  res.state.pendingSince = res.decision ? Date.now() : null;
  const reward = await persist(admin, inserted.id, res.state, res.finished);

  return {
    ok: true,
    matchId: inserted.id,
    events: res.newEvents,
    view: publicView(res.state),
    decision: res.decision,
    finished: res.finished,
    reward,
  };
}

/** Avanza el partido hasta la próxima parada. */
export async function advanceMatch(matchId: string): Promise<LiveResult> {
  const loaded = await loadLive(matchId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const res = catchUp(loaded.state);
  const reward = await persist(loaded.admin, matchId, res.state, res.finished);

  return {
    ok: true,
    matchId,
    events: res.events,
    view: publicView(res.state),
    decision: res.decision,
    finished: res.finished,
    reward,
  };
}

/**
 * Reanuda un partido en curso: lo pone al día y devuelve el estado
 * actual. Se usa al volver a la pantalla desde otra pestaña.
 */
export async function resumeLiveMatch(): Promise<LiveResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data } = await supabase
    .from("matches")
    .select("id")
    .eq("home_user", user.id)
    .eq("is_live", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { ok: false, error: "No tenés partidos en curso." };
  return advanceMatch(data.id);
}

/** Aplica la decisión elegida y sigue hasta la próxima parada. */
export async function decideMatch(
  matchId: string,
  optionId: string
): Promise<LiveResult> {
  const loaded = await loadLive(matchId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const state = loaded.state;
  if (!state.pending) return { ok: false, error: "No hay decisión pendiente." };

  // Validar que la opción exista (el cliente no inventa efectos).
  const valid = state.pending.options.some(
    (o: { id: string }) => o.id === optionId
  );
  if (!valid) return { ok: false, error: "Opción inválida." };

  state.pendingSince = null;
  const applied = applyDecision(state, optionId);
  const res = advance(state);
  state.pendingSince = res.decision ? Date.now() : null;
  const events = [...applied.newEvents, ...res.newEvents];
  const reward = await persist(loaded.admin, matchId, res.state, res.finished);

  return {
    ok: true,
    matchId,
    events,
    view: publicView(res.state),
    decision: res.decision,
    finished: res.finished,
    reward,
  };
}

/** Cambia la mentalidad en cualquier momento (no avanza el partido). */
export async function changeMentality(
  matchId: string,
  level: number
): Promise<LiveResult> {
  const loaded = await loadLive(matchId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const state = loaded.state;
  const ev = setMentality(state, level);
  await persist(loaded.admin, matchId, state, false);

  return {
    ok: true,
    matchId,
    events: ev ? [ev] : [],
    view: publicView(state),
    decision: state.pending,
    finished: false,
  };
}

/** Hace un cambio durante una pausa (no avanza el partido). */
export async function subPlayer(
  matchId: string,
  outName: string,
  inName: string
): Promise<LiveResult> {
  const loaded = await loadLive(matchId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const state = loaded.state;
  // Los cambios se pueden hacer en cualquier momento del partido,
  // igual que un entrenador real (salvo en la tanda de penales).
  if (state.phase === "shootout")
    return { ok: false, error: "No se puede cambiar durante los penales." };
  if (state.home.subsLeft <= 0)
    return { ok: false, error: "No te quedan cambios." };

  const bag: MatchEvent[] = [];
  const ok = applySub(state, "home", outName, inName, bag, "manual");
  if (!ok) return { ok: false, error: "No se pudo hacer el cambio." };

  await persist(loaded.admin, matchId, state, false);

  return {
    ok: true,
    matchId,
    events: bag,
    view: publicView(state),
    decision: state.pending,
    finished: false,
  };
}
