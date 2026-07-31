import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./env";

/**
 * CATÁLOGO CACHEADO
 *
 * Estas tablas son iguales para todos los usuarios y casi nunca
 * cambian (los sobres, los ítems de la tienda, los niveles de
 * dificultad). Antes se consultaban en CADA navegación de CADA
 * usuario; ahora se leen una vez y quedan guardadas en el servidor
 * durante una hora.
 *
 * Se usa un cliente sin cookies a propósito: `unstable_cache` no
 * puede guardar nada que dependa de la sesión, y estas tablas son de
 * lectura pública de todas formas. Los datos personales (monedas,
 * cartas, plantilla) siguen leyéndose frescos en cada visita.
 *
 * Si tu amigo cambia precios o agrega un sobre, tarda como mucho una
 * hora en verse. Para que salga al instante, revalidá la etiqueta
 * correspondiente o esperá ese lapso.
 */
function anon() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const HOUR = 60 * 60;

export type CatalogPack = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_coins: number;
  drop_table: unknown;
};

export type CatalogItem = {
  code: string;
  name: string;
  description: string | null;
  kind: string;
  power: number;
  price_coins: number;
  rarity: string | null;
};

export type CatalogTier = {
  code: string;
  name: string;
  subtitle: string | null;
  min_rating: number;
  max_rating: number;
  reward_mult: number;
};

export const getPacks = unstable_cache(
  async (): Promise<CatalogPack[]> => {
    const { data } = await anon()
      .from("packs")
      .select("id, code, name, description, price_coins, drop_table")
      .eq("active", true)
      .order("sort", { ascending: true });
    return (data ?? []) as CatalogPack[];
  },
  ["catalog:packs"],
  { revalidate: HOUR, tags: ["catalog"] }
);

export const getShopItems = unstable_cache(
  async (): Promise<CatalogItem[]> => {
    const { data } = await anon()
      .from("items")
      .select("code, name, description, kind, power, price_coins, rarity")
      .eq("active", true)
      .order("sort", { ascending: true });
    return (data ?? []) as CatalogItem[];
  },
  ["catalog:items"],
  { revalidate: HOUR, tags: ["catalog"] }
);

export const getTiers = unstable_cache(
  async (): Promise<CatalogTier[]> => {
    const { data } = await anon()
      .from("difficulty_tiers")
      .select("code, name, subtitle, min_rating, max_rating, reward_mult")
      .order("sort", { ascending: true });
    return (data ?? []) as CatalogTier[];
  },
  ["catalog:tiers"],
  { revalidate: HOUR, tags: ["catalog"] }
);
