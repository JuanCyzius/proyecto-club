"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetupResult = { ok: boolean; error?: string };

export async function completeSetup(
  clubName: string,
  username: string
): Promise<SetupResult> {
  const club = clubName.trim();
  const user = username.trim().toLowerCase();

  if (club.length < 3 || club.length > 24) {
    return { ok: false, error: "El nombre del club debe tener entre 3 y 24 caracteres." };
  }
  if (!/^[a-z0-9_]{3,20}$/.test(user)) {
    return {
      ok: false,
      error: "Usuario inválido: 3-20 caracteres, solo minúsculas, números o guion bajo.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("ensure_profile", {
    p_club_name: club,
    p_username: user,
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("function")) {
      return {
        ok: false,
        error:
          "Falta la migración 0006_auth_repair.sql. Ejecutala en el SQL Editor de Supabase.",
      };
    }
    return { ok: false, error: `No se pudo crear el club: ${error.message}` };
  }

  redirect("/club");
}

// Escape hatch: si algo queda inconsistente, cerrar sesión limpia el estado.
export async function abandonSession() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
