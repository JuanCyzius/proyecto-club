import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LogOut, Coins, Gem, ScrollText, ChevronRight, Layers,
  CalendarDays, Package, Target, Store, Shuffle, Shield, Users, Radio, Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { PitchBackdrop } from "@/components/brand/pitch-backdrop";
import { Counter } from "@/components/ui/counter";
import { Section, List, Row, EmptyState, Chip } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { coins as fmtCoins } from "@/lib/format";
import {
  XpBar,
  StatsGrid,
  CollectionBlock,
  type ProfileStats,
} from "./profile-stats";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  match_reward: "Partido",
  pack_buy: "Sobre",
  quick_sell: "Venta rápida",
  market_sale: "Venta en mercado",
  market_buy: "Compra en mercado",
  daily_reward: "Recompensa diaria",
  objective: "Objetivo",
  achievement: "Logro",
  season_pass: "Pase de temporada",
  season_reward: "Premio de temporada",
  draft_entry: "Entrada al draft",
  draft_reward: "Premio del draft",
  item_buy: "Ítem",
  wager_win: "Apuesta ganada",
  wager_hold: "Apuesta",
  wager_refund: "Apuesta devuelta",
  bid_hold: "Puja",
  bid_refund: "Puja devuelta",
};

export default async function ClubPage() {
  const profile = await getProfile();
  if (!profile) redirect("/setup");

  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const dailyReady = profile.last_daily !== today;

  const [{ data: ledger }, { data: matches }, { count: cardCount }, { data: statsRows }] =
    await Promise.all([
      supabase
        .from("coin_ledger")
        .select("id, delta, reason, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("matches")
        .select("id, away_name, home_score, away_score, winner")
        .eq("home_user", profile.id)
        .eq("status", "done")
        .order("played_at", { ascending: false })
        .limit(4),
      supabase
        .from("player_cards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profile.id)
        .eq("status", "in_club"),
      supabase.rpc("my_profile_stats"),
    ]);

  const stats = ((statsRows ?? []) as ProfileStats[])[0] ?? null;

  return (
    <>
      {/* Identidad del club */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-e2">
        <PitchBackdrop />
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {profile.crest_club ? (
              <ClubCrest
                club={profile.crest_club}
                size={56}
                className="shrink-0"
              />
            ) : (
              <Avatar label={profile.club_name} className="h-14 w-14 text-xl" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Chip tone="turf">Div. {profile.division}</Chip>
                <Chip>Nivel {profile.level}</Chip>
              </div>
              <h1 className="mt-1 truncate text-2xl font-extrabold leading-tight">
                {profile.club_name}
              </h1>
              <p className="text-[13px] text-muted">@{profile.username}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <LogOut size={17} />
              </button>
            </form>
          </div>

          {/* Monedero */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Wallet icon={Coins} label="Monedas" accent="text-trophy">
              <Counter value={profile.coins} />
            </Wallet>
            <Wallet icon={Gem} label="Gemas" accent="text-info">
              <Counter value={profile.gems} />
            </Wallet>
            <Wallet icon={Layers} label="Plantel" accent="text-turf">
              {cardCount ?? 0}
            </Wallet>
          </div>
        </div>
      </div>

      {/* Progresión */}
      {stats && <XpBar s={stats} />}

      {/* Estadísticas */}
      {stats && <StatsGrid s={stats} />}

      {/* Colección */}
      {stats && <CollectionBlock s={stats} />}

      {/* Accesos */}
      <Section label="Tu club">
        <List>
          <NavRow href="/leagues" icon={Trophy} label="Actividad y premios" />
          <NavRow
            href="/objectives"
            icon={Target}
            label="Objetivos"
            note={dailyReady ? "Recompensa lista" : undefined}
          />
          <NavRow href="/draft" icon={Shuffle} label="Draft" />
          <NavRow href="/crest" icon={Shield} label="Escudo del club" />
          <NavRow href="/online" icon={Radio} label="Quién está jugando" />
          <NavRow href="/clubs" icon={Users} label="Otros clubes" />
          <NavRow href="/packs" icon={Package} label="Sobres y tienda" />
          <NavRow href="/collection" icon={Layers} label="Colección" />
          <NavRow href="/market" icon={Store} label="Mercado" />
          <NavRow href="/players" icon={ScrollText} label="Catálogo" />
        </List>
      </Section>

      {/* Últimos partidos */}
      <Section label="Últimos partidos">
        {(matches ?? []).length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Todavía no jugaste"
            description="Armá tu once y disputá tu primer partido."
          />
        ) : (
          <List>
            {(matches ?? []).map((m) => {
              const res =
                m.winner === "home" ? "V" : m.winner === "draw" ? "E" : "D";
              const tone =
                m.winner === "home"
                  ? "text-turf"
                  : m.winner === "draw"
                    ? "text-muted"
                    : "text-danger";
              return (
                <Link key={m.id} href={`/match/${m.id}`} className="row tap hover:bg-surface-2">
                  <span className={`w-5 text-center text-xs font-extrabold ${tone}`}>
                    {res}
                  </span>
                  <ClubCrest club={m.away_name} size={22} showFallback={false} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.away_name}
                  </span>
                  <span className="font-display text-sm font-bold tabular-nums">
                    {m.home_score}–{m.away_score}
                  </span>
                  <ChevronRight size={15} className="text-muted-2" />
                </Link>
              );
            })}
          </List>
        )}
      </Section>

      {/* Movimientos */}
      {(ledger ?? []).length > 0 && (
        <Section label="Movimientos">
          <List>
            {(ledger ?? []).map((l) => (
              <Row key={l.id}>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {REASON_LABEL[l.reason] ?? l.reason}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    l.delta >= 0 ? "text-turf" : "text-danger"
                  }`}
                >
                  {l.delta >= 0 ? "+" : "−"}
                  {fmtCoins(Math.abs(Number(l.delta)))}
                </span>
              </Row>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

function Wallet({
  icon: Icon,
  label,
  accent,
  children,
}: {
  icon: typeof Coins;
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/70 px-2.5 py-2">
      <div className="flex items-center gap-1">
        <Icon size={12} className={accent} />
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {label}
        </span>
      </div>
      <p className="mt-0.5 font-display text-lg font-extrabold leading-none tabular-nums">
        {children}
      </p>
    </div>
  );
}

function NavRow({
  href,
  icon: Icon,
  label,
  note,
}: {
  href: string;
  icon: typeof Coins;
  label: string;
  note?: string;
}) {
  return (
    <Link href={href} className="row tap hover:bg-surface-2">
      <Icon size={17} className="shrink-0 text-turf" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      {note && <Chip tone="trophy">{note}</Chip>}
      <ChevronRight size={16} className="shrink-0 text-muted-2" />
    </Link>
  );
}
