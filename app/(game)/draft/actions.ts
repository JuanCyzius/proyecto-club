"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { simulateMatch } from "@/lib/sim";
import { playerChemistry } from "@/lib/chemistry";
import { buildAiTeam } from "../play/build-teams";
import type { SimPlayer, SimTeam } from "@/lib/sim/types";
import type { Attributes, GkAttributes } from "@/lib/players";
import type { DraftPick, DraftState } from "./types";

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient")) return "No te alcanzan las monedas.";
  if (m.includes("3 drafts hoy")) return "Ya jugaste tus 3 drafts de hoy. Volvé mañana.";
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0024_draft_mode.sql.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar.";
}

/**
 * El once del draft se arma con jugadores de clubes/países distintos,
 * así que casi nunca va a tener la química de un plantel armado a
 * propósito. Esto la castiga de verdad: entre 0.82x (química nula) y
 * 1.0x (química perfecta) sobre cada atributo.
 */
function chemistryFactor(picks: DraftPick[]): number {
  if (picks.length === 0) return 1;
  const squad = picks.map((p) => ({
    cardPos: p.position,
    slotPos: p.slot_pos,
    club: p.club_name,
    league: p.league_name,
    nation: p.nationality,
  }));
  const avg =
    squad.reduce((sum, p) => sum + playerChemistry(p, squad).total, 0) /
    squad.length; // 0-10
  return 0.82 + 0.018 * avg; // 10/10 => 1.00, 0/10 => 0.82
}

function scaleAttrs(a: Attributes, f: number): Attributes {
  return {
    pace: Math.round(a.pace * f),
    shooting: Math.round(a.shooting * f),
    passing: Math.round(a.passing * f),
    defending: Math.round(a.defending * f),
    physical: Math.round(a.physical * f),
    dribbling: Math.round(a.dribbling * f),
  };
}

function scaleGk(a: GkAttributes | null | undefined, f: number): GkAttributes | null {
  if (!a) return null;
  const scale = (v?: number) => (typeof v === "number" ? Math.round(v * f) : v);
  return {
    diving: scale(a.diving),
    handling: scale(a.handling),
    kicking: scale(a.kicking),
    positioning: scale(a.positioning),
    reflexes: scale(a.reflexes),
    speed: scale(a.speed),
  };
}

export type DraftResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export async function startDraft(): Promise<DraftResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("draft_start", {
    p_formation: "4-3-3",
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/draft");
  return { ok: true, data };
}

export async function pickPlayer(
  runId: string,
  index: number
): Promise<DraftResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("draft_pick", {
    p_run_id: runId,
    p_index: index,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/draft");
  return { ok: true, data };
}

export async function abandonDraft(runId: string): Promise<DraftResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("draft_abandon", { p_run_id: runId });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/draft");
  return { ok: true, data: null };
}

/**
 * Juega un partido del draft con el once elegido.
 * La simulación y el registro del resultado ocurren en el servidor.
 */
export async function playDraftMatch(runId: string): Promise<
  | {
      ok: true;
      matchId: string;
      won: boolean;
      homeScore: number;
      awayScore: number;
      wins: number;
      finished: boolean;
      reward?: { coins: number; packs: string[] };
    }
  | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: state, error: stErr } = await supabase.rpc("my_draft");
  if (stErr) return { ok: false, error: friendly(stErr.message ?? "") };
  const run = state as DraftState | null;
  if (!run || run.run_id !== runId)
    return { ok: false, error: "Draft no encontrado." };
  if (run.status !== "playing")
    return { ok: false, error: "Todavía estás armando el equipo." };

  // Once del draft, con los atributos ajustados por la química real
  // del plantel armado (clubes/países distintos = menos química).
  const chemFactor = chemistryFactor(run.picks ?? []);
  const starters: SimPlayer[] = (run.picks ?? []).map((p: DraftPick) => ({
    name: p.name,
    position: p.position,
    slotPos: p.slot_pos,
    attributes: scaleAttrs(p.attributes, chemFactor),
    overall: Math.round(p.overall * chemFactor),
    gkAttributes: scaleGk(p.gk_attributes, chemFactor),
  }));
  if (starters.length < 11)
    return { ok: false, error: "El once del draft está incompleto." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_name")
    .eq("id", user.id)
    .maybeSingle();

  const home: SimTeam = {
    name: `${profile?.club_name ?? "Tu club"} (Draft)`,
    starters,
    bench: [],
    tactics: {
      mentality: "balanced",
      press: "medium",
      tempo: "medium",
      width: "medium",
      passing: "mixed",
    },
  };

  // Escalera de rivales: exige un equipo cada vez mejor armado (nivel
  // + química) para sostener la racha. Llegar a 3 victorias ya cuesta,
  // y las 5 solo están al alcance de un muy buen plantel.
  const tier = ["t80", "t85", "t85", "t90", "t95"][run.wins] ?? "t90";
  const { data: drawn } = await supabase.rpc("random_opponent", {
    p_tier: tier,
  });
  const ai = (drawn as any[])?.[0];
  if (!ai) return { ok: false, error: "No se pudo sortear un rival." };

  const away = await buildAiTeam(supabase, ai);
  const seed = `draft-${runId}-${run.wins}-${Date.now()}`;

  const result = simulateMatch({
    home,
    away,
    seed,
    competition: "cup", // el draft no admite empates
  });

  const admin = createAdminClient();
  const { data: inserted } = await admin
    .from("matches")
    .insert({
      home_user: user.id,
      ai_opponent: ai.id,
      kind: "ai",
      competition: "cup",
      seed,
      status: "done",
      home_name: home.name,
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
        penalties: result.penalties ?? null,
      },
    })
    .select("id")
    .single();

  const won = result.winner === "home";
  const { data: rec, error: recErr } = await supabase.rpc("draft_record", {
    p_run_id: runId,
    p_won: won,
  });
  if (recErr) return { ok: false, error: friendly(recErr.message ?? "") };

  const r = rec as {
    wins: number;
    finished: boolean;
    coins?: number;
    packs?: string[];
  };

  revalidatePath("/draft");
  revalidatePath("/club");

  return {
    ok: true,
    matchId: inserted?.id ?? "",
    won,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    wins: r.wins,
    finished: r.finished,
    reward: r.finished
      ? { coins: r.coins ?? 0, packs: r.packs ?? [] }
      : undefined,
  };
}
