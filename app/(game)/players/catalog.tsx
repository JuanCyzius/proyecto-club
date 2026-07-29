"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCatalog } from "./actions";
import { PlayerCard } from "@/components/player-card/player-card";
import { ClubCrest, clubLogo } from "@/components/club/club-crest";
import {
  POSITIONS,
  RARITIES,
  RARITY_LABEL,
  type CatalogPlayer,
} from "@/lib/players";

const PAGE = 24;

export function Catalog({
  leagues,
  nationalities,
}: {
  leagues: string[];
  nationalities: string[];
}) {
  const [players, setPlayers] = useState<CatalogPlayer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [position, setPosition] = useState("");
  const [rarity, setRarity] = useState("");
  const [league, setLeague] = useState("");
  const [nationality, setNationality] = useState("");
  const [minOverall, setMinOverall] = useState(0);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  // Descarta respuestas que llegan tarde: si cambiás un filtro mientras
  // hay una búsqueda en vuelo, la vieja ya no puede pisar la nueva.
  const reqId = useRef(0);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (inFlight.current && !reset) return; // evita duplicar al tocar dos veces
      const myReq = ++reqId.current;
      inFlight.current = true;
      setLoading(true);
      try {
        const res = await searchCatalog({
          position,
          rarity,
          league,
          nationality,
          minOverall,
          search,
          page: reset ? 0 : page,
        });
        if (myReq !== reqId.current) return; // respuesta obsoleta
        setPlayers((prev) => (reset ? res.rows : [...prev, ...res.rows]));
        setDone(res.done);
        setPage((reset ? 0 : page) + 1);
        if (reset && res.total != null) setTotal(res.total);
      } finally {
        if (myReq === reqId.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [page, position, rarity, league, nationality, minOverall, search]
  );

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(0);
      setDone(false);
      fetchPage(true);
    }, 250);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, rarity, league, nationality, minOverall, search]);

  const activeFilters =
    (position ? 1 : 0) +
    (rarity ? 1 : 0) +
    (league ? 1 : 0) +
    (nationality ? 1 : 0) +
    (minOverall > 0 ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              className="pl-9"
              placeholder="Buscar jugador…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted hover:text-text"
            aria-label="Filtros"
          >
            <SlidersHorizontal size={18} />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-turf text-[10px] font-bold text-turf-ink">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="animate-fade-up space-y-2 rounded-xl border border-border bg-surface p-3">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={position}
                onChange={setPosition}
                placeholder="Posición"
                options={POSITIONS.map((p) => ({ value: p, label: p }))}
              />
              <Select
                value={rarity}
                onChange={setRarity}
                placeholder="Rareza"
                options={RARITIES.map((r) => ({
                  value: r,
                  label: RARITY_LABEL[r],
                }))}
              />
            </div>
            <Select
              value={league}
              onChange={setLeague}
              placeholder="Liga"
              options={leagues.map((l) => ({ value: l, label: l }))}
            />
            <Select
              value={nationality}
              onChange={setNationality}
              placeholder="Nacionalidad"
              options={nationalities.map((n) => ({ value: n, label: n }))}
            />
            <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="whitespace-nowrap text-muted">Media mín.</span>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={minOverall}
                onChange={(e) => setMinOverall(Number(e.target.value))}
                className="flex-1 accent-turf"
              />
              <span className="w-8 text-right font-bold tabular-nums text-turf">
                {minOverall || "—"}
              </span>
            </label>
            {activeFilters > 0 && (
              <button
                onClick={() => {
                  setPosition("");
                  setRarity("");
                  setLeague("");
                  setNationality("");
                  setMinOverall(0);
                }}
                className="w-full py-1 text-xs font-semibold text-muted hover:text-text"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {total !== null && (
        <p className="px-1 text-xs text-muted">
          {total.toLocaleString("es")} jugadores
        </p>
      )}

      {players.length === 0 && !loading ? (
        <p className="py-10 text-center text-sm text-muted">
          No hay jugadores con esos filtros.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {players.map((p) => (
            <Link
              key={p.id}
              href={`/players/${p.id}`}
              className="transition hover:-translate-y-0.5"
            >
              <PlayerCard player={{ ...p, gkAttributes: p.gk_attributes, clubLogo: clubLogo(p.club_name) }} />
              <p className="mt-1 flex items-center justify-center gap-1 truncate text-[11px] text-muted">
                <ClubCrest club={p.club_name} size={13} showFallback={false} />
                <span className="truncate">{p.club_name ?? "—"}</span>
              </p>
            </Link>
          ))}
        </div>
      )}

      {!done && players.length > 0 && (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => fetchPage(false)}
          disabled={loading}
        >
          {loading ? "Cargando…" : "Cargar más"}
        </Button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text focus:border-turf focus:outline-none"
    >
      <option value="">{placeholder}: todas</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
