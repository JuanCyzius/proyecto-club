"use server";

import { createClient } from "@/lib/supabase/server";

export type ArcadeTop = { club_name: string; rating: number };

/** Rating, división, récord del usuario y top del ranking arcade. */
export async function getArcadeData(): Promise<{
  rating: number;
  division: number;
  played: number;
  won: number;
  top: ArcadeTop[];
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: me }, { data: top }] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select("rating, division, ranked_played, ranked_won")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("arcade_top"),
  ]);
  return {
    rating: me?.rating ?? 1000,
    division: me?.division ?? 10,
    played: me?.ranked_played ?? 0,
    won: me?.ranked_won ?? 0,
    top: (top ?? []) as ArcadeTop[],
  };
}

/**
 * Registra el resultado del partido arcade y devuelve el cambio de
 * rating. Prototipo: lo reporta el cliente; con el server autoritativo
 * del online real, esto pasa a resolverse en el servidor.
 */
export async function reportArcade(
  my: number,
  rival: number
): Promise<{ ok: boolean; delta?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("arcade_report", {
    p_my: my,
    p_rival: rival,
  });
  if (error) return { ok: false };
  return { ok: true, delta: typeof data === "number" ? data : 0 };
}
