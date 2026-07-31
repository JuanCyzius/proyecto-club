import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { myOngoingDuel } from "./actions";
import { DuelCardsView } from "./view";

export const dynamic = "force-dynamic";

export default async function DuelCardsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Reconexión: si tenés una partida en curso, entrás directo
  const ongoing = await myOngoingDuel();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="PvP en vivo"
        title="Duelo de Cartas"
        subtitle="10 rondas, una categoría por ronda, elección secreta. Gana la suma más alta."
      />
      <DuelCardsView initialMatchId={ongoing} />
    </div>
  );
}
