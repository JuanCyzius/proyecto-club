"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Crea un amistoso 1v1 sin apuesta contra el club indicado. */
export async function sendFriendlyChallenge(
  opponentId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("create_friendly_match", {
    p_opponent: opponentId,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("could not find"))
      return {
        ok: false,
        error: "Falta ejecutar la migración 0036_retos_desde_online.sql.",
      };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo enviar el reto." };
  }
  revalidatePath("/leagues");
  return { ok: true };
}
