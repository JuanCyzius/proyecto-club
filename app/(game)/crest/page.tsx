import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { CrestPicker } from "./crest-picker";
import type { Crest } from "./actions";

export const dynamic = "force-dynamic";

export default async function CrestPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: owned }] = await Promise.all([
    supabase
      .from("profiles")
      .select("club_name, crest_club, crest_chosen")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("my_crests"),
  ]);

  const chosen = !!profile?.crest_chosen;

  return (
    <>
      <PageHeader
        eyebrow={chosen ? "Personalización" : "Primer paso"}
        title={chosen ? "Escudo del club" : "Elegí tu escudo"}
        subtitle={
          chosen
            ? "Cambiá el escudo por cualquiera de los que conseguiste."
            : "Abrí el sobre y quedate con uno de los cuatro."
        }
      />
      <CrestPicker
        clubName={profile?.club_name ?? "Tu club"}
        chosen={chosen}
        current={profile?.crest_club ?? null}
        owned={(owned ?? []) as Crest[]}
      />
    </>
  );
}
