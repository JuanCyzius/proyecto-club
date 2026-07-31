"use server";

import { createClient } from "@/lib/supabase/server";

export type PresenceRow = {
  user_id: string;
  username: string;
  club_name: string;
  crest_club: string | null;
  level: number;
  division: number;
  rating: number;
  last_seen: string | null;
  minutes_ago: number | null;
  squad_size: number;
  best_overall: number;
  matches_today: number;
  joined_at: string;
};

/** Marca al usuario como activo. Silencioso: nunca molesta si falla. */
export async function touchPresence(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("touch_presence");
}

/** Lista de clubes ordenada por actividad. */
export async function getPresence(): Promise<PresenceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("presence_list");
  if (error) return [];
  return (data ?? []) as PresenceRow[];
}

/**
 * Cuántos hay en línea. Registra el latido de paso, así la barra de
 * navegación hace UNA sola llamada en vez de dos.
 */
export async function onlineCount(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("online_count");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

/**
 * Contadores para la barra: en línea + invitaciones pendientes
 * (partidos PvP por jugar y duelos dirigidos a vos). Registra el
 * latido de presencia en la misma llamada. Si la migración 0036 no
 * corrió todavía, cae al conteo viejo sin romper nada.
 */
export async function navCounts(): Promise<{
  online: number;
  invites: number;
  chat: number;
  live: number;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("nav_counts");
  if (error) {
    return { online: await onlineCount(), invites: 0, chat: 0, live: 0 };
  }
  const d = data as {
    online?: number;
    invites?: number;
    chat?: number;
    live?: number;
  } | null;
  return {
    online: d?.online ?? 0,
    invites: d?.invites ?? 0,
    chat: d?.chat ?? 0,
    live: d?.live ?? 0,
  };
}
