import { createClient } from "@/lib/supabase/server";
import { TierList, type Tier } from "./play-list";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = createClient();
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
      <TierList tiers={(tiers ?? []) as Tier[]} />
    </div>
  );
}
