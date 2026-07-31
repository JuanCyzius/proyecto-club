import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { fetchChat } from "./actions";
import { ChatView } from "./chat-view";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initial = await fetchChat();

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col space-y-3">
      <PageHeader
        eyebrow="Comunidad"
        title="Chat"
        subtitle="Un solo canal para todo el juego. Portate bien."
      />
      <ChatView initial={initial} />
    </div>
  );
}
