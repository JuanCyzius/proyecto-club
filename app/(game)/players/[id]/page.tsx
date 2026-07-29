import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PlayerCard } from "@/components/player-card/player-card";
import { ClubCrest, clubLogo } from "@/components/club/club-crest";
import { Card, CardBody } from "@/components/ui/card";
import {
  ATTR_KEYS,
  ATTR_LABEL,
  DETAIL_GROUPS,
  GK_LABEL,
  RARITY_LABEL,
  type CatalogPlayer,
  type GkAttributes,
} from "@/lib/players";

export const dynamic = "force-dynamic";

const FOOT_LABEL: Record<string, string> = {
  Left: "Zurdo",
  Right: "Diestro",
};

function workRateEs(w?: string | null) {
  if (!w) return null;
  const map: Record<string, string> = {
    High: "Alto",
    Medium: "Medio",
    Low: "Bajo",
  };
  const [a, d] = w.split("/");
  return `Ataque ${map[a] ?? a} · Defensa ${map[d] ?? d}`;
}

export default async function PlayerDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("player_catalog")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  const player = data as CatalogPlayer | null;
  if (!player) notFound();

  const gk = (player.gk_attributes ?? null) as GkAttributes | null;
  const isKeeper = player.position === "GK" && !!gk;
  const detail = player.detail ?? {};

  return (
    <div className="space-y-5">
      <Link
        href="/players"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> Catálogo
      </Link>

      <div className="flex flex-col items-center gap-4">
        <div className="w-44">
          <PlayerCard
            player={{ ...player, gkAttributes: gk, clubLogo: clubLogo(player.club_name) }}
          />
        </div>
        <div className="text-center">
          <p className="eyebrow">
            {(player.positions ?? [player.position]).join(" · ")} ·{" "}
            {RARITY_LABEL[player.rarity]}
          </p>
          <h1 className="text-2xl font-extrabold">{player.name}</h1>
          {player.long_name && player.long_name !== player.name && (
            <p className="text-sm text-muted">{player.long_name}</p>
          )}
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm">
            <ClubCrest club={player.club_name} size={18} showFallback={false} />
            {player.club_name && (
              <span className="font-semibold">{player.club_name}</span>
            )}
            {player.league_name && (
              <span className="text-muted"> · {player.league_name}</span>
            )}
          </p>
          {player.nationality && (
            <p className="text-sm text-muted">{player.nationality}</p>
          )}
        </div>
      </div>

      {/* Meta principal */}
      <div className="grid grid-cols-3 gap-3">
        <Meta label="Media" value={String(player.overall)} highlight />
        <Meta label="Potencial" value={String(player.potential)} />
        <Meta label="Edad" value={String(player.age)} />
      </div>

      {/* Ficha */}
      <Card>
        <CardBody className="space-y-2 py-3">
          <Row label="Pie hábil" value={FOOT_LABEL[player.preferred_foot ?? ""] ?? player.preferred_foot} />
          <Row label="Pierna mala" value={player.weak_foot ? `${player.weak_foot} ★` : null} />
          <Row label="Filigranas" value={player.skill_moves ? `${player.skill_moves} ★` : null} />
          <Row label="Ritmo de trabajo" value={workRateEs(player.work_rate)} />
          <Row label="Altura" value={player.height_cm ? `${player.height_cm} cm` : null} />
          <Row label="Peso" value={player.weight_kg ? `${player.weight_kg} kg` : null} />
          <Row
            label="Nacimiento"
            value={player.dob ? new Date(player.dob).toLocaleDateString("es") : null}
          />
          <Row
            label="Reputación"
            value={
              player.international_reputation
                ? `${player.international_reputation} ★`
                : null
            }
          />
          <Row
            label="Valor"
            value={
              player.value_eur
                ? `€${Number(player.value_eur).toLocaleString("es")}`
                : null
            }
          />
        </CardBody>
      </Card>

      {/* Atributos principales / portería */}
      <div>
        <p className="eyebrow mb-2 px-1">
          {isKeeper ? "Portería" : "Atributos principales"}
        </p>
        <Card>
          <CardBody className="space-y-3">
            {isKeeper
              ? (Object.keys(GK_LABEL) as (keyof GkAttributes)[])
                  .filter((k) => gk?.[k] != null)
                  .map((k) => (
                    <Bar key={k} label={GK_LABEL[k]} value={gk![k] as number} />
                  ))
              : ATTR_KEYS.map((k) => (
                  <Bar
                    key={k}
                    label={ATTR_LABEL[k]}
                    value={player.attributes[k]}
                  />
                ))}
          </CardBody>
        </Card>
      </div>

      {/* Atributos detallados */}
      {Object.keys(detail).length > 0 && (
        <div className="space-y-3">
          <p className="eyebrow px-1">Atributos detallados</p>
          {DETAIL_GROUPS.map((group) => {
            const present = group.keys.filter(
              (k) => detail[k.key] != null
            );
            if (present.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="mb-1.5 px-1 text-xs font-semibold text-muted">
                  {group.title}
                </p>
                <Card>
                  <CardBody className="grid grid-cols-2 gap-x-4 gap-y-2 py-3">
                    {present.map((k) => (
                      <div
                        key={k.key}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate text-muted">{k.label}</span>
                        <b
                          className={`tabular-nums ${valueColor(
                            detail[k.key]
                          )}`}
                        >
                          {detail[k.key]}
                        </b>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {player.player_traits && (
        <div>
          <p className="eyebrow mb-2 px-1">Rasgos</p>
          <Card>
            <CardBody className="py-3 text-sm text-muted">
              {player.player_traits}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function valueColor(v: number) {
  return v >= 85 ? "text-turf" : v >= 70 ? "text-trophy" : "text-text";
}

function Bar({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? "bg-turf" : value >= 70 ? "bg-trophy" : "bg-muted";
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ transform: `scaleX(${(value) / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </div>
      <span className="w-7 text-right text-sm font-bold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Meta({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardBody className="p-3 text-center">
        <p
          className={`text-2xl font-extrabold tabular-nums ${
            highlight ? "text-turf" : ""
          }`}
        >
          {value}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      </CardBody>
    </Card>
  );
}
