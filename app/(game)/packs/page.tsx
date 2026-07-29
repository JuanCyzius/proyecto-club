import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PackStore, type ShopItem } from "./pack-store";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function PacksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: packs }, { data: profile }, { data: shopItems }] = await Promise.all([
    supabase
      .from("packs")
      .select("id, code, name, description, price_coins, drop_table")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase.from("profiles").select("coins").eq("id", user.id).maybeSingle(),
    supabase
      .from("items")
      .select("code, name, description, kind, power, price_coins, rarity")
      .eq("active", true)
      .order("sort", { ascending: true }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Tienda"
        title="Sobres"
        subtitle="Las probabilidades son públicas. El resultado lo decide el servidor."
      />
      <PackStore
        packs={packs ?? []}
        coins={profile?.coins ?? 0}
        items={(shopItems ?? []) as ShopItem[]}
      />
    </div>
  );
}
