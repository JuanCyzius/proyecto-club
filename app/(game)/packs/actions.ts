"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PulledCard } from "./types";

export async function openPack(
  packId: string,
  idempotencyKey: string
): Promise<
  { ok: true; cards: PulledCard[] } | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("open_pack", {
    p_pack_id: packId,
    p_idem: idempotencyKey,
  });

  if (error) {
    const raw = error.message ?? "";
    const msg = raw.toLowerCase();
    if (msg.includes("insufficient funds")) {
      return { ok: false, error: "No te alcanzan las monedas." };
    }
    if (msg.includes("duplicate")) {
      return { ok: false, error: "Ese sobre ya fue abierto." };
    }
    if (msg.includes("could not find") || msg.includes("does not exist")) {
      return {
        ok: false,
        error:
          "Falta actualizar la base: ejecutá la migración 0016_fix_packs.sql.",
      };
    }
    if (msg.includes("statement timeout") || msg.includes("canceling")) {
      return {
        ok: false,
        error:
          "La apertura tardó demasiado. Ejecutá 0016_fix_packs.sql (optimiza el sorteo).",
      };
    }
    // Mostrar el error real: sin esto no se puede diagnosticar nada.
    return { ok: false, error: `No se pudo abrir el sobre: ${raw}` };
  }

  const cards = ((data as any)?.cards ?? []) as PulledCard[];
  revalidatePath("/packs");
  revalidatePath("/club");
  revalidatePath("/squad");
  return { ok: true, cards };
}

export async function openDraftCreditPack(
  creditId: number
): Promise<
  { ok: true; cards: PulledCard[] } | { ok: false; error: string }
> {
  const supabase = createClient();
  const idem = `draft-${creditId}-${Date.now()}`;
  const { data, error } = await supabase.rpc("redeem_draft_pack", {
    p_credit_id: creditId,
    p_idem: idem,
  });

  if (error) {
    const raw = error.message ?? "";
    const msg = raw.toLowerCase();
    if (msg.includes("ya fue canjeado")) {
      return { ok: false, error: "Ese sobre ya fue abierto." };
    }
    if (msg.includes("could not find") || msg.includes("does not exist")) {
      return {
        ok: false,
        error: "Falta ejecutar la migración 0024_draft_mode.sql.",
      };
    }
    return { ok: false, error: `No se pudo abrir el sobre: ${raw}` };
  }

  const cards = ((data as any)?.cards ?? []) as PulledCard[];
  revalidatePath("/packs");
  revalidatePath("/draft");
  revalidatePath("/club");
  revalidatePath("/squad");
  return { ok: true, cards };
}

export async function claimWelcome(): Promise<{
  ok: boolean;
  granted?: number;
  error?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_welcome");

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("could not find") || msg.includes("does not exist")) {
      return {
        ok: false,
        error:
          "Falta la función claim_welcome. Ejecutá supabase/migrations/0005_economy.sql en el SQL Editor.",
      };
    }
    if (msg.includes("no player templates") || msg.includes("catalog empty")) {
      return {
        ok: false,
        error:
          "El catálogo está vacío. Importá players_22.csv siguiendo supabase/import/README.md.",
      };
    }
    if (msg.includes("not authenticated")) {
      return { ok: false, error: "Tu sesión expiró. Volvé a entrar." };
    }
    return { ok: false, error: `No se pudo reclamar el plantel: ${error.message}` };
  }

  const granted = Number(data ?? 0);
  if (granted === 0) {
    return {
      ok: false,
      error:
        "No se repartió ningún jugador. Revisá que el catálogo tenga datos (importá el CSV).",
    };
  }

  revalidatePath("/squad");
  revalidatePath("/club");
  return { ok: true, granted };
}

export async function buyItem(
  code: string,
  qty: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("buy_item", {
    p_code: code,
    p_qty: qty,
  });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("insufficient"))
      return { ok: false, error: "No te alcanzan las monedas." };
    if (raw.toLowerCase().includes("could not find"))
      return {
        ok: false,
        error: "Falta ejecutar la migración 0017_injuries_and_items.sql.",
      };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") };
  }
  revalidatePath("/packs");
  revalidatePath("/collection");
  return { ok: true };
}
