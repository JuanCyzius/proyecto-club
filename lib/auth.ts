import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getSessionUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/**
 * Estado de sesión sin ambigüedad. Evita el bucle de redirecciones:
 * un usuario autenticado SIN perfil no debe volver a /login.
 */
export type AuthState =
  | { status: "anonymous" }
  | { status: "no-profile"; userId: string; email: string | null }
  | { status: "ready"; profile: Profile };

export async function getAuthState(): Promise<AuthState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    return { status: "no-profile", userId: user.id, email: user.email ?? null };
  }
  return { status: "ready", profile: data as Profile };
}
