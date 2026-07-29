import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await getAuthState();
  if (state.status === "ready") redirect("/club");
  if (state.status === "no-profile") redirect("/setup");
  redirect("/login");
}
