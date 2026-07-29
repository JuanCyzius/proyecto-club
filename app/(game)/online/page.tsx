import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { getPresence, touchPresence } from "./actions";
import { OnlineView } from "./online-view";

export const dynamic = "force-dynamic";

export default async function OnlinePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Entrar acá también cuenta como actividad
  await touchPresence();
  const rows = await getPresence();

  return (
    <>
      <PageHeader
        eyebrow="El grupo"
        title="Quién está jugando"
        subtitle="Actividad de todos los clubes, en tiempo real."
      />
      <OnlineView initial={rows} userId={user.id} />
    </>
  );
}
