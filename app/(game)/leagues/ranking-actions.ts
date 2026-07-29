"use server";

import { createClient } from "@/lib/supabase/server";

export type RankRow = {
  user_id: string;
  username: string;
  club_name: string;
  crest_club: string | null;
  value: number;
};

/** Ranking del día o de la semana, por partidos jugados o monedas ganadas. */
export async function periodRanking(
  metric: "matches" | "coins",
  period: "day" | "week"
): Promise<RankRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("period_ranking", {
    p_metric: metric,
    p_period: period,
  });
  if (error) return [];
  return (data ?? []) as RankRow[];
}
