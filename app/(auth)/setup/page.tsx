import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect("/login");
  if (state.status === "ready") redirect("/club");

  const suggested = (state.email ?? "").split("@")[0] ?? "";
  return <SetupForm suggestedUsername={suggested} />;
}
