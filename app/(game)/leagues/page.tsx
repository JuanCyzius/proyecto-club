import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeaguesView, type StandingRow, type PendingMatch, type Rival } from "./leagues-view";
import { periodRanking, dailyTop } from "./ranking-actions";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Liga del grupo activa
  const { data: comp } = await supabase
    .from("competitions")
    .select("id, name, type, status")
    .eq("type", "league")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let standings: StandingRow[] = [];
  if (comp) {
    const { data: rows } = await supabase
      .from("standings")
      .select("user_id, played, won, drawn, lost, gf, ga, points")
      .eq("competition_id", comp.id);

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, username, club_name");

    const byId = new Map(
      ((profiles ?? []) as any[]).map((p) => [p.id, p])
    );

    standings = ((rows ?? []) as any[])
      .map((r) => ({
        userId: r.user_id as string,
        clubName: byId.get(r.user_id)?.club_name ?? "—",
        username: byId.get(r.user_id)?.username ?? "",
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        gf: r.gf,
        ga: r.ga,
        points: r.points,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.gf - b.ga - (a.gf - a.ga) ||
          b.gf - a.gf
      );
  }

  const [{ data: pending }, { data: me }, { data: rivals }, ranking, dailyWinners] = await Promise.all([
    supabase.rpc("my_pending_matches"),
    supabase
      .from("profiles")
      .select("coins, rating, division, ranked_played, ranked_won, club_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("public_profiles")
      .select("id, username, club_name, rating, division")
      .neq("id", user.id)
      .order("rating", { ascending: false })
      .limit(30),
    periodRanking("matches", "week"),
    dailyTop(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Competición"
        title="Ligas"
        subtitle="Enfrentate a los otros clubes del grupo."
      />
      <LeaguesView
        userId={user.id}
        hasLeague={!!comp}
        leagueName={comp?.name ?? null}
        standings={standings}
        pending={(pending ?? []) as PendingMatch[]}
        rivals={(rivals ?? []) as Rival[]}
        coins={me?.coins ?? 0}
        rating={me?.rating ?? 1000}
        division={me?.division ?? 10}
        rankedPlayed={me?.ranked_played ?? 0}
        rankedWon={me?.ranked_won ?? 0}
        ranking={ranking}
        dailyWinners={dailyWinners}
      />
    </div>
  );
}
