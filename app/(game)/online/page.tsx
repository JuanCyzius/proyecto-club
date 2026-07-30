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

  // Entrar acá cuenta como actividad, y la lista se pide a la vez.
  const [, rows] = await Promise.all([touchPresence(), getPresence()]);

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
