"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  FORMATIONS,
  BENCH_SLOTS,
  isValidFormation,
  validTactics,
  type Tactics,
} from "@/lib/formations";

export type SaveResult = { ok: boolean; error?: string };

export async function saveSquad(
  formation: string,
  tactics: Partial<Tactics>,
  slots: Record<string, string> // slot -> cardId
): Promise<SaveResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  if (!isValidFormation(formation)) {
    return { ok: false, error: "Formación inválida." };
  }
  const cleanTactics = validTactics(tactics);

  // Slots permitidos para esta formación + banca.
  const allowedSlots = new Set<string>([
    ...FORMATIONS[formation].map((s) => s.code),
    ...BENCH_SLOTS,
  ]);

  const entries = Object.entries(slots).filter(
    ([slot, cardId]) => allowedSlots.has(slot) && !!cardId
  );
  const cardIds = entries.map(([, cardId]) => cardId);

  // Una carta no puede estar en dos slots.
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: "Una carta está repetida en dos posiciones." };
  }

  // Server-authoritative: todas las cartas deben pertenecer al usuario.
  if (cardIds.length > 0) {
    const { data: owned } = await supabase
      .from("player_cards")
      .select("id")
      .eq("owner_id", user.id)
      .in("id", cardIds);
    const ownedSet = new Set((owned ?? []).map((c) => c.id));
    if (ownedSet.size !== cardIds.length) {
      return { ok: false, error: "Alguna carta no te pertenece." };
    }
  }

  // Upsert de la plantilla.
  const { error: sqErr } = await supabase.from("squads").upsert({
    user_id: user.id,
    formation,
    tactics: cleanTactics,
    updated_at: new Date().toISOString(),
  });
  if (sqErr) return { ok: false, error: "No se pudo guardar la plantilla." };

  // Reemplazar slots.
  await supabase.from("squad_slots").delete().eq("user_id", user.id);
  if (entries.length > 0) {
    const rows = entries.map(([slot, cardId]) => ({
      user_id: user.id,
      slot,
      card_id: cardId,
    }));
    const { error: slErr } = await supabase.from("squad_slots").insert(rows);
    if (slErr) return { ok: false, error: "No se pudieron guardar las posiciones." };
  }

  revalidatePath("/squad");
  return { ok: true };
}
