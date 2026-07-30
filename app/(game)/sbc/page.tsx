import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { getSbc, type SbcCard } from "./actions";
import { SbcView } from "./sbc-view";

export const dynamic = "force-dynamic";

export default async function SbcPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [challenges, { data: rows }, { data: slotRows }] = await Promise.all([
    getSbc(),
    supabase
      .from("player_cards")
      .select(
        "id, status, template:player_templates(position, overall, rarity, identity:player_identities(name, club_name, league_name, nationality))"
      )
      .eq("owner_id", user.id)
      .eq("status", "in_club"),
    supabase.from("squad_slots").select("card_id").eq("user_id", user.id),
  ]);

  // Las cartas del once/banca no se pueden entregar
  const inSquad = new Set(
    (slotRows ?? []).map((s) => s.card_id).filter(Boolean) as string[]
  );
  const cards: SbcCard[] = ((rows ?? []) as any[])
    .filter((r) => !inSquad.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.template?.identity?.name ?? "—",
      position: r.template?.position,
      overall: r.template?.overall ?? 0,
      rarity: r.template?.rarity ?? "common",
      club_name: r.template?.identity?.club_name ?? null,
      league_name: r.template?.identity?.league_name ?? null,
      nationality: r.template?.identity?.nationality ?? null,
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Desafíos"
        title="Desafíos de plantilla"
        subtitle="Entregá jugadores que cumplan las condiciones y cobrá el premio. Las cartas entregadas se pierden."
      />
      <SbcView challenges={challenges} cards={cards} />
    </div>
  );
}
