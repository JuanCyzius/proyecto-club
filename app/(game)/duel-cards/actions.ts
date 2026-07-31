"use server";

import { createClient } from "@/lib/supabase/server";
import type { Attributes, Position, Rarity } from "@/lib/players";

export type DuelCard = {
  name: string;
  position: Position;
  rarity: Rarity;
  overall: number;
  attrs: Attributes;
};

export type RoundLog = {
  round: number;
  category: string[];
  p1: { card: DuelCard; total: number };
  p2: { card: DuelCard; total: number };
  winner: "p1" | "p2" | "tie";
};

export type DuelState = {
  match_id: string;
  status: "waiting" | "active" | "done" | "cancelled";
  code: string | null;
  stake: number;
  round: number;
  seconds_left: number | null;
  category: string[] | null;
  my_cards: DuelCard[] | null;
  my_used: number[];
  my_pick: number | null;
  rival_picked: boolean;
  my_score: number;
  rival_score: number;
  my_side: "p1" | "p2";
  rounds: RoundLog[];
  winner: "me" | "rival" | null;
  rival_name: string | null;
};

type R = { ok: true; data?: unknown } | { ok: false; error: string };

function fail(e: { message?: string } | null): { ok: false; error: string } {
  const raw = e?.message ?? "";
  if (raw.toLowerCase().includes("could not find"))
    return { ok: false, error: "Falta ejecutar la migración 0043_duelo_de_cartas.sql." };
  if (raw.toLowerCase().includes("insufficient"))
    return { ok: false, error: "No te alcanzan las monedas." };
  return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo completar." };
}

export async function searchDuel(stake: number): Promise<R> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_cards_search", { p_stake: stake });
  if (error) return fail(error);
  return { ok: true, data };
}

export async function createRoom(stake: number): Promise<R> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_cards_create_room", { p_stake: stake });
  if (error) return fail(error);
  return { ok: true, data };
}

export async function joinCode(code: string): Promise<R> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_cards_join_code", { p_code: code });
  if (error) return fail(error);
  return { ok: true, data };
}

export async function cancelSearch(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("duel_cards_cancel");
}

export async function pickCard(matchId: string, idx: number): Promise<R> {
  const supabase = createClient();
  const { error } = await supabase.rpc("duel_cards_pick", { p_match: matchId, p_idx: idx });
  if (error) return fail(error);
  return { ok: true };
}

export async function tickMatch(matchId: string): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("duel_cards_tick", { p_match: matchId });
}

export async function forfeitMatch(matchId: string): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("duel_cards_forfeit", { p_match: matchId });
}

export async function fetchState(matchId: string): Promise<DuelState | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_cards_state", { p_match: matchId });
  if (error) return null;
  return data as DuelState;
}

/** ¿Tengo una partida en curso? (reconexión al entrar a la pantalla) */
export async function myOngoingDuel(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("duel_cards_mine");
  if (error || !data) return null;
  return data as string;
}
