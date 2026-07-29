import { createClient } from "@/lib/supabase/server";
import { Catalog } from "./catalog";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const supabase = createClient();
  const [{ data: leaguesRaw }, { data: nationsRaw }] = await Promise.all([
    supabase.rpc("list_leagues"),
    supabase.rpc("list_nationalities"),
  ]);

  const leagues = ((leaguesRaw ?? []) as { league_name: string }[])
    .map((l) => l.league_name)
    .filter(Boolean);
  const nationalities = ((nationsRaw ?? []) as { nationality: string }[])
    .map((n) => n.nationality)
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Base de datos"
        title="Catálogo"
        subtitle="Todos los jugadores del juego."
      />
      <Catalog leagues={leagues} nationalities={nationalities} />
    </div>
  );
}
