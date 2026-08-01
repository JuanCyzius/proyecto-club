"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function quickSell(
  cardId: string
): Promise<{ ok: boolean; value?: number; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("quick_sell", {
    p_card_id: cardId,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("bound")) {
      return { ok: false, error: "Esa carta está vinculada al club." };
    }
    return { ok: false, error: "No se pudo vender la carta." };
  }
  revalidatePath("/collection");
  revalidatePath("/squad");
  revalidatePath("/club");
  return { ok: true, value: Number(data) };
}

/** Usa un ítem una vez: afecta a todo el plantel (no a una sola carta). */
export async function applyItemToSquad(
  code: string
): Promise<{ ok: boolean; affected?: number; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("use_item", {
    p_code: code,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("could not find")) {
      return {
        ok: false,
        error: "Falta ejecutar la migración 0032_recompensas_y_plantel.sql.",
      };
    }
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo usar el ítem." };
  }
  revalidatePath("/collection");
  revalidatePath("/squad");
  const r = data as { affected?: number } | null;
  return { ok: true, affected: r?.affected };
}

/** Descarta varios jugadores de una vez por monedas. */
export async function quickSellMany(
  cardIds: string[]
): Promise<{ ok: boolean; sold?: number; coins?: number; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("quick_sell_many", {
    p_card_ids: cardIds,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("could not find"))
      return { ok: false, error: "Falta ejecutar la migración 0027." };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") };
  }
  revalidatePath("/collection");
  revalidatePath("/club");
  const r = data as { sold: number; coins: number };
  return { ok: true, sold: r.sold, coins: r.coins };
}

export type MyPositionChange = {
  code: string;
  from_pos: string;
  to_pos: string;
  qty: number;
};

/** Cambios de posición disponibles del usuario. */
export async function myPositionChanges(): Promise<MyPositionChange[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_position_changes");
  if (error) return [];
  return (data ?? []) as MyPositionChange[];
}

/** Aplica un cambio de posición a un jugador puntual. */
export async function applyPositionChange(
  code: string,
  cardId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("apply_position_change", {
    p_code: code,
    p_card_id: cardId,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("could not find"))
      return { ok: false, error: "Falta ejecutar la migración 0054_sobre_posiciones.sql." };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo aplicar." };
  }
  revalidatePath("/collection");
  revalidatePath("/squad");
  return { ok: true };
}
