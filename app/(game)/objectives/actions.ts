"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProgressResult = { ok: boolean; error?: string; data?: unknown };

function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("could not find") || m.includes("does not exist"))
    return "Falta ejecutar las migraciones 0022 y 0023.";
  return raw.replace(/^.*?:\s*/, "") || "No se pudo completar.";
}

export async function claimObjective(code: string): Promise<ProgressResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_objective", {
    p_code: code,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/objectives");
  revalidatePath("/club");
  return { ok: true, data };
}

export async function claimDaily(): Promise<ProgressResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_daily");
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/objectives");
  revalidatePath("/club");
  return { ok: true, data };
}

export async function claimPassLevel(level: number): Promise<ProgressResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_pass_level", {
    p_level: level,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/objectives");
  return { ok: true, data };
}

export async function claimAchievement(code: string): Promise<ProgressResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_achievement", {
    p_code: code,
  });
  if (error) return { ok: false, error: friendly(error.message ?? "") };
  revalidatePath("/objectives");
  return { ok: true, data };
}

