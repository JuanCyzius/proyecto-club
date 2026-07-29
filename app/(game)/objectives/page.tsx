import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ObjectivesView, type Objective, type PassTier, type Achievement, type LeaderRow } from "./objectives-view";

export const dynamic = "force-dynamic";

export default async function ObjectivesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: objectives },
    { data: pass },
    { data: achievements },
    { data: leaders },
    { data: profile },
    { data: season },
  ] = await Promise.all([
    supabase.rpc("my_objectives"),
    supabase.rpc("my_season_pass"),
    supabase.rpc("my_achievements"),
    supabase.rpc("leaderboard", { p_kind: "rating" }),
    supabase
      .from("profiles")
      .select("coins, xp, level, season_xp, last_daily, daily_streak")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("seasons")
      .select("number, name")
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Progresión</p>
        <h1 className="text-2xl font-extrabold">Objetivos</h1>
        <p className="mt-1 text-sm text-muted">
          {season?.name ?? "Temporada 1"} · Nivel {profile?.level ?? 1}
        </p>
      </div>
      <ObjectivesView
        objectives={(objectives ?? []) as Objective[]}
        pass={(pass ?? []) as PassTier[]}
        achievements={(achievements ?? []) as Achievement[]}
        leaders={(leaders ?? []) as LeaderRow[]}
        userId={user.id}
        dailyClaimed={profile?.last_daily === today}
        streak={profile?.daily_streak ?? 0}
      />
    </div>
  );
}
