import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, List, EmptyState } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { Avatar } from "@/components/ui/avatar";
import { Users, ChevronRight } from "lucide-react";
import { coins as fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

type ClubRow = {
  user_id: string;
  username: string;
  club_name: string;
  crest_club: string | null;
  level: number;
  rating: number;
  squad_value: number;
};

export default async function ClubsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("list_clubs");
  const clubs = (data ?? []) as ClubRow[];

  return (
    <>
      <PageHeader
        eyebrow="Explorar"
        title="Clubes"
        subtitle="Mirá la plantilla y el valor de los otros clubes."
      />
      {clubs.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía sos el único"
          description="Cuando se sumen más clubes al grupo, vas a poder verlos acá."
        />
      ) : (
        <List>
          {clubs.map((c) => (
            <Link
              key={c.user_id}
              href={`/clubs/${c.user_id}`}
              className="row tap hover:bg-surface-2"
            >
              {c.crest_club ? (
                <ClubCrest club={c.crest_club} size={34} />
              ) : (
                <Avatar label={c.club_name} className="h-[34px] w-[34px] text-xs" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {c.club_name}
                </span>
                <span className="text-[11px] text-muted">
                  @{c.username} · Nivel {c.level}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-display text-sm font-extrabold text-turf">
                  {c.rating}
                </span>
                <span className="text-[10px] text-muted">
                  €{fmt(Math.round(c.squad_value / 1000))}k
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted-2" />
            </Link>
          ))}
        </List>
      )}
    </>
  );
}
