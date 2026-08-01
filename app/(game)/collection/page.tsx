import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OwnedCard } from "@/lib/players";
import type { CollectionCard } from "./collection-list";
import { CollectionList } from "./collection-list";
import { myPositionChanges } from "./actions";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const posChanges = await myPositionChanges();
  const [{ data: credits }, { data: cardRows }, { data: slotRows }, { data: profile }] =
    await Promise.all([
      supabase.rpc("my_draft_credits"),
      supabase
        .from("player_cards")
        .select(
          "id, bound, stamina, injury_type, injury_matches_left, position_override, template:player_templates(position, positions, overall, rarity, attributes, gk_attributes, identity:player_identities(name, club_name, league_name, nationality))"
        )
        .eq("owner_id", user.id)
        .eq("status", "in_club"),
      supabase.from("squad_slots").select("card_id").eq("user_id", user.id),
      supabase.from("profiles").select("coins").eq("id", user.id).maybeSingle(),
    ]);

  const inSquad = new Set(
    (slotRows ?? []).map((s) => s.card_id).filter(Boolean) as string[]
  );

  const cards = ((cardRows ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.template?.identity?.name ?? "—",
    // La posición cambiada con un ítem manda sobre la del catálogo
    position: r.position_override ?? r.template?.position,
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
    injuryMatches: r.injury_matches_left ?? 0,
    bound: r.bound as boolean,
    inSquad: inSquad.has(r.id),
  })) as CollectionCard[];

  const itemsQuery = supabase
    .from("user_items")
    .select("item_code, qty, item:items(name, description, kind, power)")
    .eq("user_id", user.id)
    .gt("qty", 0);
  const { data: items } = await itemsQuery;

  const inventory = ((items ?? []) as any[]).map((r) => ({
    code: r.item_code as string,
    qty: r.qty as number,
    name: r.item?.name ?? r.item_code,
    description: r.item?.description ?? "",
    kind: r.item?.kind as "heal" | "stamina",
    power: r.item?.power as number,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Tu club</p>
        <h1 className="text-2xl font-extrabold">Colección</h1>
        <p className="mt-1 text-sm text-muted">
          {cards.length} jugadores. Vendé duplicados para hacer monedas.
        </p>
      </div>
      <CollectionList
        cards={cards}
        coins={profile?.coins ?? 0}
        inventory={inventory}
        posChanges={posChanges}
        packCredits={
          ((credits ?? []) as { id: number; pack_name: string }[]).map((c) => ({
            id: c.id,
            name: c.pack_name,
          }))
        }
      />
    </div>
  );
}
