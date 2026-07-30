import {
  Clock,
  Swords,
  Trophy,
  Target,
  Heart,
  Layers,
  Package,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Section } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { flagEmoji } from "@/lib/flags";
import { coins as fmt } from "@/lib/format";
import { RARITY_LABEL, type Rarity } from "@/lib/players";

export type ProfileStats = {
  xp: number;
  level: number;
  xp_into_level: number;
  xp_for_level: number;
  xp_to_next: number;
  matches_played: number;
  matches_won: number;
  matches_drawn: number;
  matches_lost: number;
  goals_for: number;
  goals_against: number;
  clean_sheets: number;
  minutes_played: number;
  cards_owned: number;
  unique_players: number;
  catalog_size: number;
  best_overall: number;
  fav_card_name: string | null;
  fav_card_overall: number | null;
  fav_card_position: string | null;
  fav_card_rarity: string | null;
  fav_card_club: string | null;
  fav_card_nationality: string | null;
  packs_opened: number;
  coins_earned: number;
  duels_won: number;
  member_since: string;
};

/** "12 h 30 min" a partir de minutos disputados. */
function playedTime(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 100) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${h} h`;
}

/**
 * Barra de experiencia. Es el elemento principal del perfil, así que
 * ocupa su propio bloque y muestra los tres datos: porcentaje, cifras
 * absolutas y cuánto falta.
 */
export function XpBar({ s }: { s: ProfileStats }) {
  const pct = Math.min(
    100,
    Math.round((s.xp_into_level / s.xp_for_level) * 100)
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-e2">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="font-display text-lg font-extrabold">
          Nivel {s.level}
        </span>
        <span className="font-display text-lg font-extrabold tabular-nums text-turf">
          {pct}%
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full origin-left rounded-full bg-gradient-to-r from-turf-dim to-turf"
          style={{
            transform: `scaleX(${pct / 100})`,
            transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="tabular-nums text-muted">
          {fmt(s.xp_into_level)} / {fmt(s.xp_for_level)} XP
        </span>
        <span className="text-muted-2">{fmt(s.xp)} totales</span>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        Faltan <b className="text-text">{fmt(s.xp_to_next)} XP</b> para subir a
        Nivel {s.level + 1}.
      </p>
    </div>
  );
}

/** Cuadrícula de estadísticas, con el mismo lenguaje visual del juego. */
export function StatsGrid({ s }: { s: ProfileStats }) {
  const winRate =
    s.matches_played > 0
      ? Math.round((s.matches_won / s.matches_played) * 100)
      : 0;

  return (
    <Section label="Estadísticas">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={Clock}
          label="Tiempo jugado"
          value={playedTime(s.minutes_played)}
        />
        <Stat
          icon={Swords}
          label="Partidos"
          value={s.matches_played}
          accent="text-text"
        />
        <Stat
          icon={Trophy}
          label="Ganados"
          value={s.matches_won}
          hint={s.matches_played > 0 ? `${winRate}% de victorias` : undefined}
          accent="text-turf"
        />
        <Stat
          icon={Target}
          label="Goles"
          value={s.goals_for}
          hint={`${s.goals_against} en contra`}
          accent="text-trophy"
        />
        <Stat icon={Shield} label="Vallas invictas" value={s.clean_sheets} />
        <Stat icon={Package} label="Sobres abiertos" value={s.packs_opened} />
      </div>
    </Section>
  );
}

/** Progreso de colección + la carta favorita. */
export function CollectionBlock({ s }: { s: ProfileStats }) {
  const pct =
    s.catalog_size > 0
      ? Math.min(100, (s.unique_players / s.catalog_size) * 100)
      : 0;

  return (
    <Section label="Colección">
      <div className="space-y-2">
        <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-e1">
          <div className="mb-2 flex items-center gap-2">
            <Layers size={14} className="text-turf" />
            <span className="text-[13px] font-semibold text-muted">
              Jugadores obtenidos
            </span>
            <span className="ml-auto font-display text-base font-extrabold tabular-nums">
              {fmt(s.unique_players)}
              <span className="text-xs font-semibold text-muted">
                {" "}
                / {fmt(s.catalog_size)}
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full origin-left rounded-full bg-turf"
              style={{
                transform: `scaleX(${Math.max(pct, 0.4) / 100})`,
                transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {s.cards_owned !== s.unique_players && (
              <>
                {fmt(s.cards_owned)} cartas en total ·{" "}
              </>
            )}
            {pct < 1 ? "menos del 1%" : `${pct.toFixed(1)}%`} del catálogo
          </p>
        </div>

        {s.fav_card_name && (
          <div className="flex items-center gap-3 rounded-2xl border border-trophy/35 bg-trophy-soft/15 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-trophy/20 text-trophy">
              <Heart size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-wide text-muted">
                Tu mejor jugador
              </span>
              <span className="block truncate text-sm font-bold">
                {s.fav_card_name}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span>{flagEmoji(s.fav_card_nationality)}</span>
                <ClubCrest
                  club={s.fav_card_club}
                  size={11}
                  showFallback={false}
                />
                <span className="truncate">
                  {s.fav_card_position} ·{" "}
                  {RARITY_LABEL[s.fav_card_rarity as Rarity] ??
                    s.fav_card_rarity}
                </span>
              </span>
            </span>
            <span className="font-display shrink-0 text-2xl font-extrabold text-trophy">
              {s.fav_card_overall}
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  accent = "text-text",
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-e1">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-muted" />
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-0.5 font-display text-xl font-extrabold leading-tight tabular-nums",
          accent
        )}
      >
        {typeof value === "number" ? fmt(value) : value}
      </p>
      {hint && <p className="text-[10px] text-muted-2">{hint}</p>}
    </div>
  );
}
