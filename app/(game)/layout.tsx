import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";

export const dynamic = "force-dynamic";

export default async function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect("/login");
  if (state.status === "no-profile") redirect("/setup");

  return (
    <div className="min-h-dvh">
      <main
        className="app-shell animate-fade-up space-y-5 py-5"
        style={{ paddingBottom: "calc(var(--nav-h) + 28px)" }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
