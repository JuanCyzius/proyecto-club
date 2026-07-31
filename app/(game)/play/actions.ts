"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { simulateMatch } from "@/lib/sim";
import { buildHomeTeam, buildAiTeam } from "./build-teams";

type PlayResult =
  | { ok: true; matchId: string }
  | { ok: false; error: string };

/**
 * Partido instantáneo (sin decisiones). Se conserva para simulaciones
 * automáticas y como respaldo del modo en vivo.
 */
export async function simulateVsAI(tierCode: string): Promise<PlayResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const home = await buildHomeTeam(supabase, user.id);
  if ("error" in home) return { ok: false, error: home.error };

  const { data: drawn } = await supabase.rpc("random_opponent", {
    p_tier: tierCode,
  });
  const ai = (drawn as any[])?.[0];
  if (!ai) return { ok: false, error: "No hay rivales en esa dificultad." };

  const away = await buildAiTeam(supabase, ai);

  const seed = `${ai.id}-${user.id}-${Date.now()}-${Math.floor(
    Math.random() * 1e9
  ).toString(16)}`;

  const result = simulateMatch({
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
      status: "done",
      home_name: home.team.name,
      away_name: away.name,
      home_score: result.homeScore,
      away_score: result.awayScore,
      winner: result.winner,
      played_at: new Date().toISOString(),
      log: {
        events: result.events,
        stats: result.stats,
        ratings: result.ratings,
        wentToPenalties: result.wentToPenalties,
        // Parte de equipos: se guarda para poder mostrar la media, la
        // química y la formación de ambos antes/después del partido.
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
        penalties: result.penalties ?? null,
      },
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: "No se pudo guardar el partido." };
  }

  await supabase.rpc("grant_match_reward", { p_match_id: inserted.id });

  return { ok: true, matchId: inserted.id };
}
