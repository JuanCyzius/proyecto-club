import Link from "next/link";
import { Flag } from "@/components/ui/flag";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users, Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Section, List, Row, StatTile, EmptyState } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { Avatar } from "@/components/ui/avatar";
import { coins as fmt } from "@/lib/format";

export const dynamic = "force-dynamic";

type Summary = {
  username: string;
  club_name: string;
  crest_club: string | null;
  level: number;
  division: number;
  rating: number;
  squad_size: number;
  starters: number;
  avg_overall: number;
  squad_value: number;
  best_overall: number;
};

type SquadRow = {
  slot: string;
  player_name: string;
  position: string;
  overall: number;
  rarity: string;
  club_name: string | null;
  nationality: string | null;
  value_eur: number | null;
};

export default async function ClubDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: sum }, { data: squad }] = await Promise.all([
    supabase.rpc("club_summary", { p_user: params.id }),
    supabase.rpc("public_squad", { p_user: params.id }),
  ]);

  const s = (sum as Summary[])?.[0];
  if (!s) notFound();
  const rows = (squad ?? []) as SquadRow[];
  const starters = rows.filter((r) => !r.slot.startsWith("SUB"));
  const bench = rows.filter((r) => r.slot.startsWith("SUB"));

  return (
    <>
      <Link
        href="/clubs"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> Clubes
      </Link>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-e2">
        {s.crest_club ? (
          <ClubCrest club={s.crest_club} size={52} />
        ) : (
          <Avatar label={s.club_name} className="h-13 w-13 text-lg" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{s.club_name}</h1>
          <p className="text-[13px] text-muted">
            @{s.username} · Nivel {s.level} · Div. {s.division}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Media del once" value={s.avg_overall || "—"} accent="turf" />
        <StatTile label="Mejor jugador" value={s.best_overall || "—"} accent="trophy" />
        <StatTile label="Plantel" value={s.squad_size} />
      </div>

      <div className="rounded-2xl border border-trophy/35 bg-trophy-soft/20 px-4 py-3 text-center">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Valor de la plantilla
        </p>
        <p className="font-display text-2xl font-extrabold text-trophy">
          €{fmt(s.squad_value)}
        </p>
      </div>

      {starters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin once armado"
          description="Este club todavía no configuró su alineación."
        />
      ) : (
        <Section label={`Once titular (${starters.length})`}>
          <List>
            {starters.map((r) => (
              <Row key={r.slot}>
                <span className="w-9 shrink-0 text-center text-[11px] font-bold text-muted">
                  {r.slot}
                </span>
                <span className="font-display w-7 shrink-0 text-center text-base font-extrabold">
                  {r.overall}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {r.player_name}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    <Flag nation={r.nationality} size={12} />
                    <ClubCrest club={r.club_name} size={11} showFallback={false} />
                    <span className="truncate">{r.club_name ?? "—"}</span>
                  </span>
                </span>
              </Row>
            ))}
          </List>
        </Section>
      )}

      {bench.length > 0 && (
        <Section label={`Suplentes (${bench.length})`}>
          <List>
            {bench.map((r) => (
              <Row key={r.slot}>
                <Shirt size={13} className="shrink-0 text-muted-2" />
                <span className="font-display w-7 shrink-0 text-center text-sm font-bold">
                  {r.overall}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.player_name}
                </span>
                <span className="text-[10px] text-muted">{r.position}</span>
              </Row>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}
