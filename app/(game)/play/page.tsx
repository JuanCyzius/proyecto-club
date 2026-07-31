import { createClient } from "@/lib/supabase/server";
import { TierList, type Tier } from "./play-list";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Partido en curso: se puede volver a él sin perderlo
  const { data: live } = user
    ? await supabase
        .from("matches")
        .select("id, away_name, home_score, away_score")
        .eq("home_user", user.id)
        .eq("is_live", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: tiers } = await supabase
    .from("difficulty_tiers")
    .select("code, name, subtitle, min_rating, max_rating, reward_mult")
    .order("sort", { ascending: true });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Partido"
        title="Jugar"
        subtitle="El rival se sortea al azar dentro del nivel que elijas."
      />
      <TierList
        tiers={(tiers ?? []) as Tier[]}
        ongoing={
          live
            ? {
                awayName: live.away_name ?? "Rival",
                score: `${live.home_score ?? 0}-${live.away_score ?? 0}`,
              }
            : null
        }
      />
    </div>
  );
}
