"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OpenDuel = {
  id: string;
  challenger: string;
  username: string;
  club_name: string;
  crest_club: string | null;
  challenger_level: number;
  stake_coins: number;
  stake_rarity: string | null;
  created_at: string;
  is_mine: boolean;
  for_you: boolean;
};

export type DuelHistory = {
  id: string;
  rival_name: string;
  rival_crest: string | null;
  my_score: number;
  rival_score: number;
  won: boolean;
  stake_coins: number;
  stake_rarity: string | null;
  played_at: string;
};

export type WagerCard = {
  card_id: string;
  player_name: string;
  overall: number;
  position: string;
  rarity: string;
  club_name: string | null;
};

export type DuelRound = {
  round: number;
  challenger_shot: number;
  challenger_goal: boolean;
  opponent_dive: number;
  opponent_zones: number;
  opponent_shot: number;
  opponent_goal: boolean;
  challenger_dive: number;
  challenger_zones: number;
  score: [number, number];
};

export type DuelResult = {
  challenger_score: number;
  opponent_score: number;
  winner: string;
  you_won: boolean;
  rounds: DuelRound[];
  your_keeper_zones: number;
  rival_keeper_zones: number;
};

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient")) return "No te alcanzan las monedas.";
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0029_penalty_duels.sql.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar.";
}

export async function listOpenDuels(): Promise<OpenDuel[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("duels_open");
  return (data ?? []) as OpenDuel[];
}

export async function duelHistory(): Promise<DuelHistory[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("duels_history");
  return (data ?? []) as DuelHistory[];
}

export async function myWagerableCards(rarity?: string): Promise<WagerCard[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("wagerable_cards", {
    p_rarity: rarity ?? null,
  });
  return (data ?? []) as WagerCard[];
}

export async function createDuel(
  shots: number[],
  dives: number[],
  stakeCoins: number,
  cardId: string | null,
  targetId: string | null = null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("duel_create", {
    p_shots: shots,
    p_dives: dives,
    p_stake_coins: stakeCoins,
    p_card_id: cardId,
    p_target: targetId,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/duels");
  return { ok: true };
}

export async function cancelDuel(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("duel_cancel", { p_id: id });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/duels");
  return { ok: true };
}

export async function playDuel(
  id: string,
  shots: number[],
  dives: number[],
  cardId: string | null
): Promise<{ ok: true; result: DuelResult } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_play", {
    p_id: id,
    p_shots: shots,
    p_dives: dives,
    p_card_id: cardId,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/duels");
  revalidatePath("/club");
  return { ok: true, result: data as DuelResult };
}
