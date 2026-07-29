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
