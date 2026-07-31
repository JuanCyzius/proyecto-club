import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPacks, getShopItems } from "@/lib/supabase/catalog";
import { PackStore, type ShopItem } from "./pack-store";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export default async function PacksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El catálogo (sobres e ítems) sale del caché: es igual para todos.
  // Solo las monedas y los sobres ganados se leen frescos.
  const [packs, shopItems, { data: profile }, { data: draftCredits }] =
    await Promise.all([
      getPacks(),
      getShopItems(),
      supabase.from("profiles").select("coins").eq("id", user.id).maybeSingle(),
      supabase.rpc("my_draft_credits"),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Tienda"
        title="Sobres"
        subtitle="Las probabilidades son públicas. El resultado lo decide el servidor."
      />
      <PackStore
        packs={packs as never}
        coins={profile?.coins ?? 0}
        items={shopItems as unknown as ShopItem[]}
        draftCredits={
          (draftCredits ?? []) as {
            id: number;
            pack_code: string;
            pack_name: string;
          }[]
        }
      />
    </div>
  );
}
