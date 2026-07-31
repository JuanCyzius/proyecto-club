"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type QuickItem = {
  code: string;
  name: string;
  kind: "heal" | "stamina";
  power: number;
  qty: number;
};

/** Ítems disponibles para usar directo desde la plantilla. */
export async function myItems(): Promise<QuickItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_items")
    .select("qty, item:items(code, name, kind, power)")
    .gt("qty", 0);
  if (error) return [];
  return ((data ?? []) as any[])
    .filter((r) => r.item)
    .map((r) => ({
      code: r.item.code,
      name: r.item.name,
      kind: r.item.kind,
      power: r.item.power,
      qty: r.qty,
    }));
}

/** Usa un ítem sobre todo el plantel (misma lógica que en Colección). */
export async function applyItemToSquadQuick(
  code: string
): Promise<{ ok: boolean; affected?: number; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("use_item", { p_code: code });
  if (error) {
    const raw = error.message ?? "";
    return {
      ok: false,
      error: raw.replace(/^.*?:\s*/, "") || "No se pudo usar el ítem.",
    };
  }
  revalidatePath("/squad");
  revalidatePath("/collection");
  return { ok: true, affected: (data as { affected?: number })?.affected };
}

/** Levanta una sanción pagando monedas (500 por fecha restante). */
export async function paySuspension(
  cardId: string
): Promise<{ ok: boolean; paid?: number; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("pay_suspension", {
    p_card_id: cardId,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("insufficient"))
      return { ok: false, error: "No te alcanzan las monedas." };
    if (raw.toLowerCase().includes("could not find"))
      return { ok: false, error: "Falta ejecutar la migración 0047_tarjetas_rojas.sql." };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo." };
  }
  revalidatePath("/squad");
  return { ok: true, paid: (data as { paid?: number })?.paid };
}
