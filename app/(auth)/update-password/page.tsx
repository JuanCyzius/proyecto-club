import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  // Solo accesible con la sesión temporal que crea el enlace de recuperación.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <UpdatePasswordForm />;
}
