import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DraftView } from "./draft-view";
import type { DraftState, PackCredit } from "./types";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: state }, { data: config }, { data: profile }, { data: credits }, { data: runsToday }] =
    await Promise.all([
      supabase.rpc("my_draft"),
      supabase
        .from("draft_config")
        .select("entry_coins, rewards")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("profiles").select("coins").eq("id", user.id).maybeSingle(),
      supabase.rpc("my_draft_credits"),
      supabase.rpc("my_draft_runs_today"),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Modo especial"
        title="Draft"
        subtitle="Armá un equipo de cracks y ganá 5 partidos seguidos."
      />
      <DraftView
        initial={(state as DraftState | null) ?? null}
        entryCoins={config?.entry_coins ?? 2000}
        rewards={
          (config?.rewards as Record<
            string,
            { coins: number; packs: string[] }
          >) ?? {}
        }
        coins={profile?.coins ?? 0}
        credits={(credits ?? []) as PackCredit[]}
        runsToday={typeof runsToday === "number" ? runsToday : 0}
        maxRunsPerDay={3}
      />
    </div>
  );
}
