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

  // Todo lo que no depende de otra consulta se pide a la vez: antes eran
  // seis viajes encadenados a la base y ahora son dos rondas.
  const [{ data: me }, { data: cardRows }, { data: squad }, { data: slotRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("crest_chosen")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("player_cards")
        .select(
          "id, stamina, injury_type, injury_matches_left, template:player_templates(position, positions, overall, rarity, attributes, gk_attributes, identity:player_identities(name, club_name, league_name, nationality))"
        )
        .eq("owner_id", user.id),
      supabase
        .from("squads")
        .select("formation, tactics")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("squad_slots").select("slot, card_id").eq("user_id", user.id),
    ]);

  // El escudo del club se elige antes que el plantel inicial.
  if (me && !me.crest_chosen) redirect("/crest");

  // La recuperación por descanso no bloquea el render: si tarda, da igual.
  void supabase.rpc("recover_stamina");

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
    injuryType: r.injury_type ?? null,
    injuryMatches: typeof r.injury_matches_left === "number" ? r.injury_matches_left : 0,
  }));

  if (cards.length === 0) {
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
