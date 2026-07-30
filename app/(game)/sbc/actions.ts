"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamChemistry, type ChemPlayer } from "@/lib/chemistry";
import { RARITIES, type Position, type Rarity } from "@/lib/players";

export type SbcRequirements = {
  size: number;
  min_avg?: number;
  max_rarity?: Rarity;
  min_chem?: number;
  rarity_min?: { rarity: Rarity; count: number };
  nation?: { name: string; count: number };
  league?: { name: string; count: number };
  club?: { name: string; count: number };
};

export type SbcChallenge = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  kind: "fixed" | "daily" | "hard";
  repeatable: boolean;
  requirements: SbcRequirements;
  reward_coins: number;
  reward_packs: string[];
  period: string;
  done_count: number;
};

export type SbcCard = {
  id: string;
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  club_name: string | null;
  league_name: string | null;
  nationality: string | null;
};

export async function getSbc(): Promise<SbcChallenge[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sbc_active");
  if (error) return [];
  return ((data ?? []) as any[]).map((c) => ({
    ...c,
    reward_packs: (c.reward_packs ?? []) as string[],
  })) as SbcChallenge[];
}

const rIdx = (r: Rarity) => RARITIES.indexOf(r);
const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/** Valida las restricciones. Devuelve la lista de incumplimientos. */
export async function checkRequirements(
  req: SbcRequirements,
  cards: SbcCard[]
): Promise<string[]> {
  const fails: string[] = [];
  if (cards.length !== req.size) fails.push(`Faltan jugadores (${cards.length}/${req.size}).`);
  if (cards.length === 0) return fails;

  const avg = Math.round(cards.reduce((s, c) => s + c.overall, 0) / cards.length);
  if (req.min_avg && avg < req.min_avg) fails.push(`Media ${avg}, se pide ${req.min_avg}+.`);
  if (req.max_rarity) {
    const cap = rIdx(req.max_rarity);
    if (cards.some((c) => rIdx(c.rarity) > cap))
      fails.push(`Solo se aceptan cartas hasta rareza ${req.max_rarity}.`);
  }
  if (req.rarity_min) {
    const min = rIdx(req.rarity_min.rarity);
    const n = cards.filter((c) => rIdx(c.rarity) >= min).length;
    if (n < req.rarity_min.count)
      fails.push(`Se piden ${req.rarity_min.count} de rareza ${req.rarity_min.rarity} o mejor (tenés ${n}).`);
  }
  for (const [key, get] of [
    ["nation", (c: SbcCard) => c.nationality],
    ["league", (c: SbcCard) => c.league_name],
    ["club", (c: SbcCard) => c.club_name],
  ] as const) {
    const r = req[key];
    if (r) {
      const n = cards.filter((c) => norm(get(c)) === norm(r.name)).length;
      if (n < r.count) fails.push(`Se piden ${r.count} de ${r.name} (tenés ${n}).`);
    }
  }
  if (req.min_chem && cards.length === req.size) {
    const squad: ChemPlayer[] = cards.map((c) => ({
      cardPos: c.position,
      slotPos: c.position,
      club: c.club_name,
      league: c.league_name,
      nation: c.nationality,
    }));
    const chem = teamChemistry(squad);
    if (chem < req.min_chem) fails.push(`Química ${chem}, se pide ${req.min_chem}+.`);
  }
  return fails;
}

/** Entrega el desafío: valida todo en el servidor y consume las cartas. */
export async function submitSbc(
  challengeId: number,
  cardIds: string[]
): Promise<{ ok: true; coins: number; packs: string[] } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  // Desafío vigente (revalida rotación y estado)
  const all = await getSbc();
  const ch = all.find((c) => c.id === challengeId);
  if (!ch) return { ok: false, error: "Ese desafío ya no está disponible." };
  if (!ch.repeatable && ch.done_count > 0)
    return { ok: false, error: "Ya completaste este desafío." };

  // Cartas del usuario (con datos reales del catálogo)
  const { data: rows } = await supabase
    .from("player_cards")
    .select(
      "id, status, template:player_templates(position, overall, rarity, identity:player_identities(name, club_name, league_name, nationality))"
    )
    .eq("owner_id", user.id)
    .in("id", cardIds);

  const cards: SbcCard[] = ((rows ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.template?.identity?.name ?? "—",
    position: r.template?.position,
    overall: r.template?.overall ?? 0,
    rarity: r.template?.rarity ?? "common",
    club_name: r.template?.identity?.club_name ?? null,
    league_name: r.template?.identity?.league_name ?? null,
    nationality: r.template?.identity?.nationality ?? null,
  }));
  if (cards.length !== cardIds.length)
    return { ok: false, error: "Alguna carta no es tuya o no existe." };

  const fails = await checkRequirements(ch.requirements, cards);
  if (fails.length > 0) return { ok: false, error: fails[0] };

  // Consumo atómico con la clave del servidor (revisa once/mercado/duplicados)
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("sbc_consume", {
    p_user: user.id,
    p_challenge: challengeId,
    p_cards: cardIds,
    p_period: ch.period,
  });
  if (error)
    return { ok: false, error: (error.message ?? "").replace(/^.*?:\s*/, "") || "No se pudo entregar." };

  revalidatePath("/sbc");
  revalidatePath("/collection");
  revalidatePath("/packs");
  const r = data as { coins?: number; packs?: string[] };
  return { ok: true, coins: r?.coins ?? 0, packs: r?.packs ?? [] };
}
