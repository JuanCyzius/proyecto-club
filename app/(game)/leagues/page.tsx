import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { periodRanking, dailyTop } from "./ranking-actions";
import { ActivityView } from "./activity-view";

export const dynamic = "force-dynamic";

/**
 * El PvP viejo (ligas/ranked/retos simulados) fue retirado: lo
 * reemplaza el nuevo PvP arcade. Esta pantalla conserva la actividad
 * competitiva: premio diario y rankings.
 */
export default async function ActivityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ranking, dailyWinners] = await Promise.all([
    periodRanking("matches", "week"),
    dailyTop(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Competición"
        title="Actividad"
        subtitle="Premio diario a los que más juegan y rankings del grupo."
      />
      <ActivityView userId={user.id} ranking={ranking} dailyWinners={dailyWinners} />
    </div>
  );
}
