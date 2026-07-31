import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MatchEvent, PlayerRating, TeamStats } from "@/lib/sim/types";
import { MatchReplay } from "./match-replay";

export const dynamic = "force-dynamic";

import type { TeamReport } from "@/components/match/team-report";

type MatchLog = {
  events: MatchEvent[];
  stats: { home: TeamStats; away: TeamStats };
  ratings: { home: PlayerRating[]; away: PlayerRating[] };
  wentToPenalties: boolean;
  penalties: [number, number] | null;
  teams?: TeamReport;
};

export default async function MatchPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("matches")
    .select(
      "home_name, away_name, home_score, away_score, winner, log, reward_coins"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const log = data.log as MatchLog;

  return (
    <MatchReplay
      homeName={data.home_name}
      awayName={data.away_name}
      homeScore={data.home_score ?? 0}
      awayScore={data.away_score ?? 0}
      events={log.events}
      stats={log.stats}
      ratings={log.ratings}
      wentToPenalties={log.wentToPenalties}
      penalties={log.penalties}
      rewardCoins={data.reward_coins ?? null}
      teams={log.teams ?? null}
    />
  );
}
