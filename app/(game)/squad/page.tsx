import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TACTICS, type Tactics } from "@/lib/formations";
import type { OwnedCard } from "@/lib/players";
import { SquadBuilder } from "./squad-builder";
import { StarterEmpty } from "./starter-empty";

export const dynamic = "force-dynamic";

export default async function SquadPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El escudo del club se elige antes que el plantel inicial.
  const { data: me } = await supabase
    .from("profiles")
    .select("crest_chosen")
    .eq("id", user.id)
    .maybeSingle();
  if (me && !me.crest_chosen) redirect("/crest");

  // Recuperación por descanso antes de leer las cartas
  await supabase.rpc("recover_stamina");

  const { data: cardRows } = await supabase
    .from("player_cards")
    .select(
      "id, stamina, template:player_templates(position, positions, overall, rarity, attributes, gk_attributes, identity:player_identities(name, club_name, league_name, nationality))"
    )
    .eq("owner_id", user.id);

  const cards: OwnedCard[] = (cardRows ?? []).map((r: any) => ({
    id: r.id,
    name: r.template?.identity?.name ?? "—",
    position: r.template?.position,
    overall: r.template?.overall,
    rarity: r.template?.rarity,
    attributes: r.template?.attributes,
    positions: r.template?.positions ?? null,
    gkAttributes: r.template?.gk_attributes ?? null,
    clubName: r.template?.identity?.club_name ?? null,
    leagueName: r.template?.identity?.league_name ?? null,
    nationality: r.template?.identity?.nationality ?? null,
    stamina: typeof r.stamina === "number" ? r.stamina : 100,
  }));

  if (cards.length === 0) {
    // Si el catálogo está vacío no hay nada que repartir: avisamos claramente.
    const { count: templateCount } = await supabase
      .from("player_templates")
      .select("id", { count: "exact", head: true });

    return (
      <div className="space-y-4">
        <Header />
        <StarterEmpty templateCount={templateCount ?? 0} />
      </div>
    );
  }

  const { data: squad } = await supabase
    .from("squads")
    .select("formation, tactics")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: slotRows } = await supabase
    .from("squad_slots")
    .select("slot, card_id")
    .eq("user_id", user.id);

  const initialSlots: Record<string, string> = {};
  for (const s of slotRows ?? []) {
    if (s.card_id) initialSlots[s.slot] = s.card_id;
  }

  return (
    <div className="space-y-4">
      <Header />
      <SquadBuilder
        cards={cards}
        initialFormation={squad?.formation ?? "4-3-3"}
        initialTactics={(squad?.tactics as Tactics) ?? DEFAULT_TACTICS}
        initialSlots={initialSlots}
      />
    </div>
  );
}

function Header() {
  return (
    <div>
      <p className="eyebrow">Tu equipo</p>
      <h1 className="text-2xl font-extrabold">Plantilla</h1>
    </div>
  );
}
