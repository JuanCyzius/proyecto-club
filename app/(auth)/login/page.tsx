import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { AuthForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const state = await getAuthState();
  // Sesión + perfil -> al club. Sesión sin perfil -> a /setup (rompe el bucle).
  if (state.status === "ready") redirect("/club");
  if (state.status === "no-profile") redirect("/setup");
  return <AuthForm />;
}
