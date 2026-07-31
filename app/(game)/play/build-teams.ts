import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  FORMATIONS,
  BENCH_SLOTS,
  DEFAULT_TACTICS,
  validTactics,
  type Tactics,
} from "@/lib/formations";
import {
  POSITION_COMPAT,
  POSITION_GROUP,
  type Attributes,
  type GkAttributes,
  type Position,
} from "@/lib/players";
import type { SimPlayer, SimTeam } from "@/lib/sim/types";
import { playerChemistry, teamChemistry, type ChemPlayer } from "@/lib/chemistry";

const STYLE_TACTICS: Record<string, Tactics> = {
  defensive: { mentality: "defensive", press: "low", tempo: "slow", width: "narrow", passing: "mixed" },
  possession: { mentality: "balanced", press: "medium", tempo: "slow", width: "medium", passing: "short" },
  counter: { mentality: "defensive", press: "low", tempo: "fast", width: "medium", passing: "direct" },
  high_press: { mentality: "offensive", press: "high", tempo: "fast", width: "wide", passing: "mixed" },
  offensive: { mentality: "offensive", press: "high", tempo: "medium", width: "wide", passing: "mixed" },
};

type OwnedRow = {
  id: string;
  position: Position;
  overall: number;
  attributes: Attributes;
  name: string;
  gkAttributes?: GkAttributes | null;
  stamina?: number;
  clubName?: string | null;
  leagueName?: string | null;
  nationality?: string | null;
};

/**
 * La química define el 30% del rendimiento, de forma gradual:
 *   química 100 → rinde al 100% (sin castigo)
 *   química  50 → rinde al  85% (mitad del castigo)
 *   química   0 → rinde al  70% (castigo completo del 30%)
 * Se aplica sobre cada atributo del jugador. Los rivales de la IA
 * son compañeros reales del mismo club: siempre química 100.
 *
 * Recibe la química en escala 0-100.
 */
function chemFactor(chem100: number): number {
  const c = Math.max(0, Math.min(100, chem100));
  return 0.7 + 0.3 * (c / 100);
}

function scaleAttrs(a: Attributes, f: number): Attributes {
  return {
    pace: Math.round(a.pace * f),
    shooting: Math.round(a.shooting * f),
    passing: Math.round(a.passing * f),
    defending: Math.round(a.defending * f),
    physical: Math.round(a.physical * f),
    dribbling: Math.round(a.dribbling * f),
  };
}

function scaleGk(a: GkAttributes | null | undefined, f: number): GkAttributes | null {
  if (!a) return null;
  const sc = (v?: number) => (typeof v === "number" ? Math.round(v * f) : v);
  return {
    diving: sc(a.diving),
    handling: sc(a.handling),
    kicking: sc(a.kicking),
    positioning: sc(a.positioning),
    reflexes: sc(a.reflexes),
    speed: sc(a.speed),
  };
}

export async function buildHomeTeam(
  supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ team: SimTeam } | { error: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("club_name, crest_club")
    .eq("id", userId)
    .maybeSingle();

  const { data: cardRows } = await supabase
    .from("player_cards")
    .select(
      "id, stamina, injury_matches_left, suspension_matches, template:player_templates(position, overall, attributes, gk_attributes, identity:player_identities(name, club_name, league_name, nationality))"
    )
    .eq("owner_id", userId);

  const cards = new Map<string, OwnedRow>();
  const injured = new Set<string>();
  const suspended = new Set<string>();
  for (const r of (cardRows ?? []) as any[]) {
    if ((r.injury_matches_left ?? 0) > 0) injured.add(r.id);
    if ((r.suspension_matches ?? 0) > 0) suspended.add(r.id);
    cards.set(r.id, {
      id: r.id,
      position: r.template?.position,
      overall: r.template?.overall,
      attributes: r.template?.attributes,
      name: r.template?.identity?.name ?? "—",
      gkAttributes: r.template?.gk_attributes ?? null,
      stamina: typeof r.stamina === "number" ? r.stamina : 100,
      clubName: r.template?.identity?.club_name ?? null,
      leagueName: r.template?.identity?.league_name ?? null,
      nationality: r.template?.identity?.nationality ?? null,
    });
  }

  const { data: squad } = await supabase
    .from("squads")
    .select("formation, tactics")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: slotRows } = await supabase
    .from("squad_slots")
    .select("slot, card_id")
    .eq("user_id", userId);

  const slots = new Map<string, string>();
  for (const s of slotRows ?? []) if (s.card_id) slots.set(s.slot, s.card_id);

  const formation = squad?.formation ?? "4-3-3";
  const def = FORMATIONS[formation] ? formation : "4-3-3";

  // Primer recorrido: validar el once y juntar los datos de química
  const picked: { slotPos: Position; c: OwnedRow }[] = [];
  for (const slot of FORMATIONS[def]) {
    const cardId = slots.get(slot.code);
    const c = cardId ? cards.get(cardId) : undefined;
    if (!c) {
      return {
        error: "Tenés que completar tu once (11 titulares) antes de jugar.",
      };
    }
    if (cardId && injured.has(cardId)) {
      return {
        error: `${c.name} está lesionado. Cambialo o curalo con un ítem antes de jugar.`,
      };
    }
    if (cardId && suspended.has(cardId)) {
      return {
        error: `${c.name} está suspendido por roja. Cambialo antes de jugar.`,
      };
    }
    picked.push({ slotPos: slot.pos, c });
  }

  // Química real del once: afecta los atributos de cada jugador
  const chemSquad: ChemPlayer[] = picked.map(({ slotPos, c }) => ({
    cardPos: c.position,
    slotPos,
    club: c.clubName,
    league: c.leagueName,
    nation: c.nationality,
  }));
  const teamChem = teamChemistry(chemSquad);

  const starters: SimPlayer[] = picked.map(({ slotPos, c }, i) => {
    const f = chemFactor(playerChemistry(chemSquad[i], chemSquad).total * 10);
    return {
      name: c.name,
      position: c.position,
      slotPos,
      attributes: scaleAttrs(c.attributes, f),
      overall: c.overall,
      gkAttributes: scaleGk(c.gkAttributes, f),
      cardId: c.id,
      startStamina: c.stamina ?? 100,
    };
  });

  const bench: SimPlayer[] = [];
  for (const b of BENCH_SLOTS) {
    const cardId = slots.get(b);
    const c = cardId ? cards.get(cardId) : undefined;
    if (c) {
      const fb = chemFactor(teamChem);
      bench.push({
        name: c.name,
        position: c.position,
        slotPos: c.position,
        attributes: scaleAttrs(c.attributes, fb),
        overall: c.overall,
        gkAttributes: scaleGk(c.gkAttributes, fb),
        cardId: c.id,
        startStamina: c.stamina ?? 100,
      });
    }
  }

  return {
    team: {
      name: profile?.club_name ?? "Tu club",
      // El escudo es el que eligió el usuario, no su nombre de club:
      // buscar por nombre nunca encontraba nada y salía la inicial.
      crestClub: profile?.crest_club ?? null,
      starters,
      bench,
      tactics: validTactics((squad?.tactics as Tactics) ?? DEFAULT_TACTICS),
      chemistry: teamChem,
      avgOverall: Math.round(
        starters.reduce((sum, p) => sum + p.overall, 0) / starters.length
      ),
    },
  };
}

export async function buildAiTeam(
  supabase: ReturnType<typeof createClient>,
  ai: {
    name: string;
    style: string;
    rating: number;
    formation: string;
    real_club?: string | null;
  }
): Promise<SimTeam> {
  const formation = FORMATIONS[ai.formation] ? ai.formation : "4-3-3";
  let pool: OwnedRow[] = [];

  // 1) Club real: usar su plantilla auténtica del catálogo.
  if (ai.real_club) {
    const { data } = await supabase.rpc("club_squad", {
      p_club: ai.real_club,
      p_limit: 20,
    });
    pool = ((data ?? []) as any[]).map((r) => ({
      id: r.name,
      name: r.name,
      position: r.position,
      overall: r.overall,
      attributes: r.attributes,
      gkAttributes: r.gk_attributes ?? null,
    }));
  }

  // 2) Rivales de élite inventados (95, 99): se arman con los mejores
  //    jugadores del catálogo, sin límite superior de media.
  if (pool.length === 0 && ai.rating >= 92) {
    const { data } = await supabase
      .from("player_catalog")
      .select("name, position, overall, attributes, gk_attributes")
      .order("overall", { ascending: false })
      .limit(60);
    pool = ((data ?? []) as any[]).map((r) => ({
      id: r.name,
      name: r.name,
      position: r.position,
      overall: r.overall,
      attributes: r.attributes,
      gkAttributes: r.gk_attributes ?? null,
    }));
  }

  // 3) Respaldo: muestrear del catálogo por nivel.
  let band = 8;
  while (pool.length < 14 && band <= 30) {
    const { data } = await supabase
      .from("player_catalog")
      .select("name, position, overall, attributes, gk_attributes")
      .gte("overall", ai.rating - band)
      .lte("overall", ai.rating + 3)
      .limit(300);
    const extra = ((data ?? []) as any[]).map((r) => ({
      id: r.name,
      name: r.name,
      position: r.position,
      overall: r.overall,
      attributes: r.attributes,
      gkAttributes: r.gk_attributes ?? null,
    }));
    const seen = new Set(pool.map((p) => p.name));
    for (const e of extra) if (!seen.has(e.name)) pool.push(e);
    band += 8;
  }

  // Barajar solo el excedente: los mejores del club deben ser titulares.
  const core = ai.real_club ? pool.slice(0, 16) : pool;
  const rest = ai.real_club ? pool.slice(16) : [];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  pool = [...core, ...rest];

  const used = new Set<number>();
  const takeFor = (slotPos: Position): OwnedRow | null => {
    const find = (test: (p: OwnedRow) => boolean) => {
      for (let i = 0; i < pool.length; i++) {
        if (!used.has(i) && test(pool[i])) {
          used.add(i);
          return pool[i];
        }
      }
      return null;
    };
    return (
      find((p) => p.position === slotPos) ??
      find((p) => POSITION_COMPAT[slotPos]?.includes(p.position)) ??
      find((p) => POSITION_GROUP[p.position] === POSITION_GROUP[slotPos]) ??
      find(() => true)
    );
  };

  const starters: SimPlayer[] = FORMATIONS[formation].map((slot) => {
    const p = takeFor(slot.pos);
    const base: OwnedRow = p ?? {
      id: "x",
      name: "Suplente",
      position: slot.pos,
      overall: ai.rating,
      attributes: {
        pace: ai.rating,
        shooting: ai.rating,
        passing: ai.rating,
        defending: ai.rating,
        physical: ai.rating,
        dribbling: ai.rating,
      },
    };
    return {
      name: base.name,
      position: base.position,
      slotPos: slot.pos,
      attributes: base.attributes,
      overall: base.overall,
      gkAttributes: base.gkAttributes ?? null,
    };
  });

  const bench: SimPlayer[] = [];
  for (const g of ["CB", "CM", "ST"] as Position[]) {
    const p = takeFor(g);
    if (p)
      bench.push({
        name: p.name,
        position: p.position,
        slotPos: p.position,
        attributes: p.attributes,
        overall: p.overall,
        gkAttributes: p.gkAttributes ?? null,
      });
  }

  // Los rivales inventados de élite reciben un refuerzo proporcional,
  // para que estén por encima de cualquier plantilla real.
  if (!ai.real_club && ai.rating >= 92) {
    const boost = ai.rating >= 98 ? 1.1 : 1.05;
    const lift = (p: SimPlayer): SimPlayer => ({
      ...p,
      overall: Math.min(99, Math.round(p.overall * boost)),
      attributes: Object.fromEntries(
        Object.entries(p.attributes).map(([k, v]) => [
          k,
          Math.min(99, Math.round((v as number) * boost)),
        ])
      ) as SimPlayer["attributes"],
      gkAttributes: p.gkAttributes
        ? (Object.fromEntries(
            Object.entries(p.gkAttributes).map(([k, v]) => [
              k,
              Math.min(99, Math.round((v as number) * boost)),
            ])
          ) as SimPlayer["gkAttributes"])
        : p.gkAttributes,
    });
    return {
      name: ai.name,
      starters: starters.map(lift),
      bench: bench.map(lift),
      tactics: STYLE_TACTICS[ai.style] ?? DEFAULT_TACTICS,
    };
  }

  return {
    name: ai.name,
    starters,
    bench,
    tactics: STYLE_TACTICS[ai.style] ?? DEFAULT_TACTICS,
    crestClub: ai.real_club ?? ai.name,
    // Los rivales de la IA son compañeros del mismo club: química plena.
    chemistry: 100,
    avgOverall: Math.round(
      starters.reduce((sum, p) => sum + p.overall, 0) / starters.length
    ),
  };
}
