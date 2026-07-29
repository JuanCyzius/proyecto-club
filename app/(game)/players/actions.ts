"use server";

import { createClient } from "@/lib/supabase/server";
import type { CatalogPlayer } from "@/lib/players";

export type CatalogFilters = {
  position?: string;
  rarity?: string;
  league?: string;
  nationality?: string;
  minOverall?: number;
  search?: string;
  page?: number;
};

const PAGE = 24;

/**
 * Búsqueda del catálogo en el servidor. Evita cargar el cliente de
 * Supabase en el navegador (unos 60 kB menos en esta pantalla).
 */
export async function searchCatalog(
  f: CatalogFilters
): Promise<{ rows: CatalogPlayer[]; done: boolean; total: number | null }> {
  const supabase = createClient();
  const page = f.page ?? 0;
  const from = page * PAGE;

  let q = supabase
    .from("player_catalog")
    .select("*", page === 0 ? { count: "estimated" } : undefined)
    .order("overall", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);

  if (f.position) q = q.eq("position", f.position);
  if (f.rarity) q = q.eq("rarity", f.rarity);
  if (f.league) q = q.eq("league_name", f.league);
  if (f.nationality) q = q.eq("nationality", f.nationality);
  if (f.minOverall && f.minOverall > 0) q = q.gte("overall", f.minOverall);
  if (f.search?.trim()) {
    const term = f.search.trim().replace(/[%,()]/g, "");
    q = q.or(`name.ilike.%${term}%,long_name.ilike.%${term}%`);
  }

  const { data, error, count } = await q;
  const rows = (data as CatalogPlayer[]) ?? [];
  if (error) return { rows: [], done: true, total: null };
  return {
    rows,
    done: rows.length < PAGE,
    total: typeof count === "number" ? count : null,
  };
}
