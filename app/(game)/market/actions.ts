"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MarketResult = { ok: boolean; error?: string; value?: unknown };

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient funds")) return "No te alcanzan las monedas.";
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar la migración 0019_market.sql.";
  // Los mensajes de las RPC ya vienen en español y son informativos
  const clean = raw.replace(/^.*?:\s*/, "");
  return clean || "No se pudo completar la operación.";
}

export async function listCard(
  cardId: string,
  startPrice: number,
  buyNow: number | null,
  hours: number
): Promise<MarketResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_card", {
    p_card_id: cardId,
    p_start: startPrice,
    p_buy_now: buyNow,
    p_hours: hours,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/market");
  revalidatePath("/collection");
  return { ok: true, value: data };
}

export async function placeBid(
  listingId: string,
  amount: number
): Promise<MarketResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("place_bid", {
    p_listing_id: listingId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/market");
  return { ok: true };
}

export async function buyNow(listingId: string): Promise<MarketResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("buy_now", { p_listing_id: listingId });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/market");
  revalidatePath("/collection");
  return { ok: true };
}

export async function cancelListing(listingId: string): Promise<MarketResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_listing", {
    p_listing_id: listingId,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/market");
  revalidatePath("/collection");
  return { ok: true };
}

export async function settleExpired(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("settle_expired");
}

export type PriceHint = {
  start_price: number;
  buy_now: number;
  min_price: number;
  max_price: number;
};

/** Precio sugerido para publicar una carta, dentro del rango permitido. */
export async function suggestPrice(
  cardId: string
): Promise<{ ok: true; hint: PriceHint } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("suggest_price", {
    p_card_id: cardId,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  const hint = (data as PriceHint[])?.[0];
  if (!hint) return { ok: false, error: "No se pudo calcular el precio." };
  return { ok: true, hint };
}

/** Publica al precio sugerido, en un solo paso. */
export async function quickList(
  cardId: string
): Promise<{ ok: boolean; price?: number; error?: string }> {
  const s = await suggestPrice(cardId);
  if (!s.ok) return { ok: false, error: s.error };
  const res = await listCard(cardId, s.hint.start_price, s.hint.buy_now, 8);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, price: s.hint.buy_now };
}

// ---- Tienda de jugadores (rotación cada 2hs) ----
export type ShopSlot = {
  slot_id: number;
  slot: number;
  name: string;
  position: string;
  overall: number;
  rarity: string;
  club_name: string | null;
  nationality: string | null;
  price: number;
  expires_in_min: number;
  already_bought: boolean;
};

export async function getShop(): Promise<ShopSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("market_shop");
  if (error) return [];
  return (data ?? []) as ShopSlot[];
}

export async function buyShopPlayer(
  slotId: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("market_shop_buy", {
    p_slot_id: slotId,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("insufficient"))
      return { ok: false, error: "No te alcanzan las monedas." };
    if (raw.toLowerCase().includes("could not find"))
      return { ok: false, error: "Falta ejecutar la migración 0037_tienda_jugadores.sql." };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo comprar." };
  }
  revalidatePath("/market");
  revalidatePath("/collection");
  return { ok: true };
}
