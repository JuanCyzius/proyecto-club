import { PageHeader } from "@/components/ui/layout";
import { getArcadeData } from "./actions";
import { PvpLabView } from "./lab-view";

export const dynamic = "force-dynamic";

/** Nuevo PvP arcade (beta): suma rating y división en la liga reiniciada. */
export default async function PvpLabPage() {
  const d = await getArcadeData();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Beta"
        title="PvP Arcade"
        subtitle="8 jugadas a pura habilidad. Por ahora contra un bot; el online viene en camino."
      />
      <PvpLabView
        rating={d.rating}
        division={d.division}
        played={d.played}
        won={d.won}
        top={d.top}
      />
    </div>
  );
}
