"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { simulateMatch } from "@/lib/sim";
import { buildHomeTeam } from "./build-teams";

export type PvpResult =
  | { ok: true; matchId: string; homeScore: number; awayScore: number }
  | { ok: false; error: string };

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0021_pvp_leagues_ranked.sql.";
  if (m.includes("insufficient")) return "No te alcanzan las monedas.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar la operación.";
}

/**
 * Simula un partido PvP pendiente. Recarga las plantillas REALES de
 * ambos usuarios desde la base: el cliente no aporta ningún dato de
 * juego. Es idempotente: si el partido ya se jugó, no lo repite.
 */
export async function playPvpMatch(matchId: string): Promise<PvpResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const admin = createAdminClient();
  const { data: match } = await admin
    .from("matches")
    .select(
      "id, home_user, away_user, competition, competition_id, seed, status, stake, home_score, away_score"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { ok: false, error: "Partido no encontrado." };
  if (match.home_user !== user.id && match.away_user !== user.id)
    return { ok: false, error: "No participás en ese partido." };

  // Ya jugado: devolver el resultado existente
  if (match.status === "done") {
    return {
      ok: true,
      matchId,
      homeScore: match.home_score ?? 0,
      awayScore: match.away_score ?? 0,
    };
  }
  if (!match.away_user) return { ok: false, error: "Ese partido no es PvP." };

  // Plantillas reales de ambos, cargadas en el servidor
  const home = await buildHomeTeam(supabase, match.home_user);
  if ("error" in home)
    return { ok: false, error: `Local: ${home.error}` };
  const away = await buildHomeTeam(supabase, match.away_user);
  if ("error" in away)
    return { ok: false, error: `Visitante: ${away.error}` };

  const result = simulateMatch({
    home: home.team,
    away: away.team,
    seed: match.seed,
    competition: match.competition === "cup" ? "cup" : "league",
  });

  const { error: upErr } = await admin
    .from("matches")
    .update({
      status: "done",
      home_score: result.homeScore,
      away_score: result.awayScore,
      winner: result.winner,
      played_at: new Date().toISOString(),
      log: {
        events: result.events,
        stats: result.stats,
        ratings: result.ratings,
        wentToPenalties: result.wentToPenalties,
        penalties: result.penalties ?? null,
      },
    })
    .eq("id", matchId)
    .eq("status", "pending"); // evita doble resolución

  if (upErr) return { ok: false, error: "No se pudo guardar el partido." };

  // Efectos posteriores (todos idempotentes)
  if (match.competition_id) {
    await supabase.rpc("apply_standings", { p_match_id: matchId });
  }
  if (match.competition === "ranked") {
    await supabase.rpc("apply_ranked_result", { p_match_id: matchId });
  }
  if ((match.stake ?? 0) > 0) {
    await supabase.rpc("settle_wager", { p_match_id: matchId });
  }

  revalidatePath("/leagues");
  revalidatePath("/club");
  return {
    ok: true,
    matchId,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
  };
}

/** Busca un rival de nivel parecido y crea el partido ranked. */
export async function findRankedMatch(): Promise<
  { ok: true; matchId: string } | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("find_ranked_match");
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/leagues");
  return { ok: true, matchId: data as string };
}

/** Reta a otro club apostando monedas (escrow de ambos lados). */
export async function createWager(
  opponentId: string,
  stake: number
): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_wager_match", {
    p_opponent: opponentId,
    p_stake: stake,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/leagues");
  return { ok: true, matchId: data as string };
}

/** Juega todos los partidos pendientes del usuario (jornada completa). */
export async function playAllPending(): Promise<{
  ok: boolean;
  played: number;
  error?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_pending_matches");
  if (error) return { ok: false, played: 0, error: friendly(error.message ?? "") };

  const pending = (data as { id: string }[]) ?? [];
  let played = 0;
  for (const m of pending.slice(0, 10)) {
    const res = await playPvpMatch(m.id);
    if (res.ok) played++;
  }
  revalidatePath("/leagues");
  return { ok: true, played };
}
