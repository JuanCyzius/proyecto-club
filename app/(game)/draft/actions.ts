"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLiveMatch, advance, publicView } from "@/lib/sim/live";
import { DEFAULT_TACTICS } from "@/lib/formations";
import { playerChemistry, teamChemistry, type ChemPlayer } from "@/lib/chemistry";
import { buildAiTeam } from "../play/build-teams";
import type { SimPlayer, SimTeam } from "@/lib/sim/types";
import type { Attributes, GkAttributes } from "@/lib/players";
import type { DraftPick, DraftState } from "./types";
import type { LiveResult } from "../play/live-actions";

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient")) return "No te alcanzan las monedas.";
  if (m.includes("3 drafts hoy")) return "Ya jugaste tus 3 drafts de hoy. Volvé mañana.";
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0024_draft_mode.sql.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar.";
}

/**
 * La química define el 30% del rendimiento, igual que en el resto del
 * juego: química 100 rinde al 100%, química 0 rinde al 70%. En el
 * draft pesa especialmente, porque el equipo se arma con jugadores de
 * clubes y países distintos.
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
  const chem = teamChemistry(squad); // 0-100
  return 0.7 + 0.3 * (chem / 100);
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
/**
 * Arranca el partido del draft con el MISMO motor en vivo que el
 * partido rápido: relato minuto a minuto, decisiones, penales y
 * cambios. El resultado se registra al terminar (ver finishDraftMatch).
 */
export async function playDraftMatch(runId: string): Promise<LiveResult> {
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

  const picks = run.picks ?? [];
  const starters11 = picks.filter((p) => !p.slot.startsWith("SUB"));
  const benchPicks = picks.filter((p) => p.slot.startsWith("SUB"));
  if (starters11.length < 11)
    return { ok: false, error: "El once del draft está incompleto." };

  // La química del once armado pesa igual que en el resto del juego
  const chemFactorTeam = chemistryFactor(starters11);
  const toSim = (p: DraftPick, f: number): SimPlayer => ({
    name: p.name,
    position: p.position,
    slotPos: p.slot_pos,
    attributes: scaleAttrs(p.attributes, f),
    overall: p.overall,
    gkAttributes: scaleGk(p.gk_attributes, f),
    startStamina: 100,
  });

  const starters = starters11.map((p) => toSim(p, chemFactorTeam));
  const bench = benchPicks.map((p) => toSim(p, chemFactorTeam));

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_name, crest_club")
    .eq("id", user.id)
    .maybeSingle();

  const home: SimTeam = {
    name: `${profile?.club_name ?? "Tu club"} (Draft)`,
    starters,
    bench,
    tactics: { ...DEFAULT_TACTICS },
    chemistry: Math.round(
      teamChemistry(
        starters11.map((p) => ({
          cardPos: p.position,
          slotPos: p.slot_pos ?? p.position,
          club: p.club_name ?? null,
          league: p.league_name ?? null,
          nation: p.nationality ?? null,
        }))
      )
    ),
    avgOverall: Math.round(
      starters11.reduce((sum, p) => sum + p.overall, 0) / starters11.length
    ),
    crestClub: profile?.crest_club ?? null,
  };

  // Escalera de rivales: cada victoria exige un equipo mejor
  const tier = ["t80", "t85", "t85", "t90", "t95"][run.wins] ?? "t90";
  const { data: ai } = await supabase.rpc("random_opponent", { p_tier: tier });
  const opponent = Array.isArray(ai) ? ai[0] : ai;
  if (!opponent) return { ok: false, error: "No se encontró rival." };

  const away = await buildAiTeam(supabase, opponent);
  // La química del rival va de 80 a 100 y sube con la dificultad:
  // en la primera ronda ronda 80-92, en la última 88-100.
  const chemBase = 80 + run.wins * 2;
  away.chemistry = Math.min(
    100,
    chemBase + Math.floor(Math.random() * (100 - chemBase + 1))
  );
  const awayFactor = 0.7 + 0.3 * (away.chemistry / 100);
  away.starters = away.starters.map((p) => ({
    ...p,
    attributes: scaleAttrs(p.attributes, awayFactor),
    gkAttributes: scaleGk(p.gkAttributes, awayFactor),
  }));

  const seed = `draft-${runId}-${run.wins}-${Date.now()}`;
  const liveState = createLiveMatch({
    home,
    away,
    seed,
    competition: "cup", // el draft no admite empates
  });

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("matches")
    .insert({
      home_user: user.id,
      ai_opponent: opponent.id,
      kind: "ai",
      competition: "cup",
      seed,
      status: "live",
      is_live: true,
      home_name: home.name,
      away_name: away.name,
      live_state: liveState as unknown as object,
      log: {
        draft_run: runId,
        teams: {
          home: {
            name: home.name,
            avgOverall: home.avgOverall ?? null,
            chemistry: home.chemistry ?? null,
            starters: home.starters.map((p) => ({
              name: p.name,
              position: p.position,
              slotPos: p.slotPos,
              overall: p.overall,
            })),
          },
          away: {
            name: away.name,
            avgOverall: away.avgOverall ?? null,
            chemistry: away.chemistry ?? null,
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

  const res = advance(liveState);
  res.state.pendingSince = res.decision ? Date.now() : null;
  await admin
    .from("matches")
    .update({ live_state: res.state as unknown as object })
    .eq("id", inserted.id);

  revalidatePath("/draft");
  return {
    ok: true,
    matchId: inserted.id,
    events: res.newEvents,
    view: publicView(res.state),
    decision: res.decision,
    finished: res.finished,
    reward: null,
  };
}

/**
 * Registra el resultado del partido del draft una vez terminado.
 * Se llama desde la pantalla cuando el partido llega al final.
 */
export async function finishDraftMatch(
  matchId: string
): Promise<
  | {
      ok: true;
      won: boolean;
      wins: number;
      finished: boolean;
      reward?: { coins: number; packs: string[] };
    }
  | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("draft_result", {
    p_match_id: matchId,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  const r = data as {
    won: boolean;
    wins: number;
    finished: boolean;
    coins?: number;
    packs?: string[];
  };
  revalidatePath("/draft");
  revalidatePath("/packs");
  return {
    ok: true,
    won: r.won,
    wins: r.wins,
    finished: r.finished,
    reward: r.finished ? { coins: r.coins ?? 0, packs: r.packs ?? [] } : undefined,
  };
}

/** Guarda formación y alineación antes de jugar. */
export async function setDraftLineup(
  runId: string,
  formation: string,
  lineup: { idx: number; slot: string; slot_pos: string }[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("draft_set_lineup", {
    p_run_id: runId,
    p_formation: formation,
    p_lineup: lineup,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/draft");
  return { ok: true };
}
