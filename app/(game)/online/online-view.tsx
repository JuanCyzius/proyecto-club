"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Circle,
  ChevronRight,
  Layers,
  Swords,
  Star,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { List, Section, StatTile, EmptyState } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { Avatar } from "@/components/ui/avatar";
import { getPresence, type PresenceRow } from "./actions";

/** "en línea", "hace 12 min", "hace 3 h", "hace 5 d". */
function lastSeenLabel(min: number | null): string {
  if (min === null) return "nunca entró";
  if (min < 3) return "en línea";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return `hace ${m} ${m === 1 ? "mes" : "meses"}`;
}

/** Verde si está ahora, ámbar si estuvo hoy, gris si hace rato. */
function dotTone(min: number | null): string {
  if (min === null) return "text-muted-2";
  if (min < 3) return "text-turf";
  if (min < 60) return "text-trophy";
  return "text-muted-2";
}

export function OnlineView({
  initial,
  userId,
}: {
  initial: PresenceRow[];
  userId: string;
}) {
  const [rows, setRows] = useState(initial);
  const [, start] = useTransition();

  // La lista se refresca sola: sirve para saber quién está justo ahora.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      start(async () => setRows(await getPresence()));
    }, 45_000);
    return () => clearInterval(id);
  }, []);

  const { online, recent, away } = useMemo(() => {
    const on: PresenceRow[] = [];
    const rec: PresenceRow[] = [];
    const aw: PresenceRow[] = [];
    for (const r of rows) {
      const m = r.minutes_ago;
      if (m !== null && m < 3) on.push(r);
      else if (m !== null && m < 60 * 24) rec.push(r);
      else aw.push(r);
    }
    return { online: on, recent: rec, away: aw };
  }, [rows]);

  const playedToday = rows.reduce((s, r) => s + r.matches_today, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          icon={Circle}
          label="En línea"
          value={online.length}
          accent="turf"
        />
        <StatTile label="Clubes" value={rows.length} />
        <StatTile
          icon={Swords}
          label="Partidos hoy"
          value={playedToday}
          accent="trophy"
        />
      </div>

      {online.length > 0 && (
        <Section label={`Conectados ahora (${online.length})`}>
          <List>
            {online.map((r) => (
              <PlayerRow key={r.user_id} r={r} me={r.user_id === userId} />
            ))}
          </List>
        </Section>
      )}

      {recent.length > 0 && (
        <Section label="Estuvieron hoy">
          <List>
            {recent.map((r) => (
              <PlayerRow key={r.user_id} r={r} me={r.user_id === userId} />
            ))}
          </List>
        </Section>
      )}

      {away.length > 0 && (
        <Section label="Hace más tiempo">
          <List>
            {away.map((r) => (
              <PlayerRow key={r.user_id} r={r} me={r.user_id === userId} />
            ))}
          </List>
        </Section>
      )}

      {rows.length === 0 && (
        <EmptyState
          icon={Circle}
          title="Todavía no hay nadie"
          description="Cuando se sumen tus amigos, vas a ver acá quién está jugando."
        />
      )}
    </div>
  );
}

function PlayerRow({ r, me }: { r: PresenceRow; me: boolean }) {
  const online = r.minutes_ago !== null && r.minutes_ago < 3;

  return (
    <Link
      href={me ? "/club" : `/clubs/${r.user_id}`}
      className={cn("row tap hover:bg-surface-2", me && "bg-turf-soft/20")}
    >
      {/* Escudo con punto de estado */}
      <span className="relative shrink-0">
        {r.crest_club ? (
          <ClubCrest club={r.crest_club} size={38} />
        ) : (
          <Avatar label={r.club_name} className="h-[38px] w-[38px] text-sm" />
        )}
        <Circle
          size={10}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full bg-surface",
            dotTone(r.minutes_ago)
          )}
          fill="currentColor"
        />
      </span>

      {/* Club arriba, usuario más chico abajo */}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{r.club_name}</span>
          {me && (
            <span className="shrink-0 text-[10px] font-bold text-turf">vos</span>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted">
          @{r.username}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-2">
          <span className="flex items-center gap-0.5">
            <Star size={9} /> {r.best_overall || "—"}
          </span>
          <span className="flex items-center gap-0.5">
            <Layers size={9} /> {r.squad_size}
          </span>
          {r.matches_today > 0 && (
            <span className="flex items-center gap-0.5 text-turf">
              <Swords size={9} /> {r.matches_today} hoy
            </span>
          )}
        </span>
      </span>

      {/* Estado y nivel */}
      <span className="shrink-0 text-right">
        <span
          className={cn(
            "flex items-center justify-end gap-1 text-[11px] font-semibold",
            online ? "text-turf" : "text-muted"
          )}
        >
          {!online && <Clock size={9} />}
          {lastSeenLabel(r.minutes_ago)}
        </span>
        <span className="block text-[10px] text-muted-2">
          Nivel {r.level} · Div. {r.division}
        </span>
      </span>

      <ChevronRight size={15} className="shrink-0 text-muted-2" />
    </Link>
  );
}
