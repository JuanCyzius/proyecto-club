"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type ActionResult = { ok: boolean; error?: string };
export type RegisterResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: string };

// Base URL para los enlaces de los emails. Usa NEXT_PUBLIC_SITE_URL si está
// definida (recomendado en producción); si no, deduce el origen del request.
function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("already") || msg.includes("registered")) {
    return "Ya existe una cuenta con ese email. Probá entrar o recuperar la contraseña.";
  }
  if (msg.includes("sending") || msg.includes("smtp") || msg.includes("mail")) {
    return "No se pudo enviar el email de confirmación. Revisá la configuración SMTP en Supabase.";
  }
  if (msg.includes("database error") || msg.includes("saving new user")) {
    return "La base de datos no pudo crear el perfil. Ejecutá la migración 0006_auth_repair.sql.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Demasiados intentos. Esperá unos minutos (o configurá SMTP propio para quitar el límite).";
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return "Ese email no es válido.";
  }
  if (msg.includes("password")) {
    return "La contraseña no cumple los requisitos (mínimo 6 caracteres).";
  }
  return `No se pudo completar: ${raw}`;
}

export async function register(
  clubName: string,
  username: string,
  email: string,
  password: string
): Promise<RegisterResult> {
  const club = clubName.trim();
  const user = username.trim().toLowerCase();
  const mail = email.trim().toLowerCase();

  if (club.length < 3 || club.length > 24) {
    return {
      ok: false,
      error: "El nombre del club debe tener entre 3 y 24 caracteres.",
    };
  }
  if (!USERNAME_RE.test(user)) {
    return {
      ok: false,
      error:
        "Usuario inválido: 3-20 caracteres, solo minúsculas, números o guion bajo.",
    };
  }
  if (!mail.includes("@") || mail.length < 5) {
    return { ok: false, error: "Escribí un email válido." };
  }
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = createClient();

  // Aviso temprano si el usuario ya está tomado (mejor UX que fallar después).
  const { data: available } = await supabase.rpc("is_username_available", {
    p_username: user,
  });
  if (available === false) {
    return { ok: false, error: "Ese usuario ya está en uso. Elegí otro." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: mail,
    password,
    options: {
      data: { username: user, club_name: club },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) return { ok: false, error: friendlyAuthError(error.message ?? "") };

  // Si "Confirm email" está activo, no hay sesión hasta confirmar.
  const needsConfirmation = !data.session;
  if (!needsConfirmation) redirect("/club");
  return { ok: true, needsConfirmation: true };
}

export async function resendConfirmation(email: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message ?? "") };
  return { ok: true };
}

export async function signIn(
  email: string,
  password: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("not confirmed")) {
      return {
        ok: false,
        error: "Tenés que confirmar tu email antes de entrar. Revisá tu bandeja.",
      };
    }
    return { ok: false, error: "Email o contraseña incorrectos." };
  }
  redirect("/club");
}

export async function requestPasswordReset(
  email: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${siteUrl()}/auth/callback?next=/update-password` }
  );
  if (error) return { ok: false, error: friendlyAuthError(error.message ?? "") };
  return { ok: true };
}

export async function updatePassword(password: string): Promise<ActionResult> {
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: friendlyAuthError(error.message ?? "") };
  redirect("/club");
}
