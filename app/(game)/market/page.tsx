import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { settleExpired, getShop } from "./actions";
import { MarketView, type Listing } from "./market-view";
import { ShopSection } from "./shop-section";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolver subastas vencidas antes de mostrar el mercado
  await settleExpired();

  const [{ data: listings }, { data: mine }, { data: profile }, shop] =
    await Promise.all([
      supabase
        .from("market_listings")
        .select("*")
        .eq("status", "active")
        .order("ends_at", { ascending: true })
        .limit(60),
      supabase
        .from("market_listings")
        .select("*")
        .eq("seller_id", user.id)
        .in("status", ["active", "sold", "expired"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("profiles").select("coins").eq("id", user.id).maybeSingle(),
      getShop(),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Traspasos"
        title="Mercado"
        subtitle="Comprá y vendé jugadores. El vendedor paga 5% de impuesto."
      />
      <ShopSection slots={shop} coins={profile?.coins ?? 0} />
      <MarketView
        listings={(listings ?? []) as Listing[]}
        mine={(mine ?? []) as Listing[]}
        coins={profile?.coins ?? 0}
        userId={user.id}
      />
    </div>
  );
}
