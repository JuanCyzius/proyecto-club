import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { duelHistory, listOpenDuels } from "./actions";
import { DuelsView } from "./duels-view";

export const dynamic = "force-dynamic";

export default async function DuelsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [open, history, { data: me }] = await Promise.all([
    listOpenDuels(),
    duelHistory(),
    supabase
      .from("profiles")
      .select("coins, level")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Duelo"
        title="Tanda de penales"
        subtitle="Elegí dónde patear y dónde atajar. Tu nivel decide cuánto arco cubre tu arquero."
      />
      <DuelsView
        open={open}
        history={history}
        coins={me?.coins ?? 0}
        level={me?.level ?? 1}
        userId={user.id}
      />
    </>
  );
}
