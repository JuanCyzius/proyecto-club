"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Crest = { club_name: string; logo_path: string; selected?: boolean };

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0026_club_crests.sql.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar.";
}

/** Sortea (una sola vez) los 4 escudos de bienvenida. */
export async function drawStarterCrests(): Promise<
  { ok: true; crests: Crest[] } | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("draw_starter_crests");
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  return { ok: true, crests: (data ?? []) as Crest[] };
}

/** Fija el escudo del club entre los que el usuario posee. */
export async function chooseCrest(
  clubName: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_club_crest", { p_club: clubName });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/crest");
  revalidatePath("/club");
  revalidatePath("/squad");
  return { ok: true };
}
