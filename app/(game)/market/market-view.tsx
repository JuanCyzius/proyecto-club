"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Flag } from "@/components/ui/flag";
import { Portrait } from "@/components/player-card/portrait";
import { Counter } from "@/components/ui/counter";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import { Coins, Search, Gavel, Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortLeague } from "@/lib/flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { ClubCrest } from "@/components/club/club-crest";
import { timeLeft } from "@/lib/format";
import { RARITIES, RARITY_LABEL, type Rarity } from "@/lib/players";
import { placeBid, buyNow, cancelListing } from "./actions";

export type Listing = {
  id: string;
  card_id: string;
  seller_id: string;
  start_price: number;
  buy_now: number | null;
  current_bid: number | null;
  current_bidder: string | null;
  status: string;
  ends_at: string;
  template_id: string;
  overall: number;
  position: string;
  rarity: Rarity;
  player_name: string;
  club_name: string | null;
  league_name: string | null;
  nationality: string | null;
};

const RARITY_DOT: Record<Rarity, string> = {
  common: "bg-[#8a5a2b]",
  uncommon: "bg-[#aab7c2]",
  rare: "bg-[#ecc65e]",
  epic: "bg-[#6f86ff]",
  legendary: "bg-[#ff5b6e]",
  icon: "bg-[#f6e7b3]",
};

export function MarketView({
  listings,
  mine,
  coins,
  userId,
}: {
  listings: Listing[];
  mine: Listing[];
  coins: number;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"buy" | "auctions" | "mine">("buy");
  const [balance, setBalance] = useState(coins);

  // El saldo puede cambiar en otra pantalla: se resincroniza con el real.
  useEffect(() => setBalance(coins), [coins]);

  // Los tiempos restantes tienen que avanzar solos, no quedar congelados.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [fLeague, setFLeague] = useState("");
  const [fClub, setFClub] = useState("");
  const [fNation, setFNation] = useState("");
  const [sortBy, setSortBy] = useState<
    "recent" | "old" | "cheap" | "expensive"
  >("recent");

  // Opciones de los filtros, tomadas de lo que hay publicado ahora
  const opts = useMemo(() => {
    const others = listings.filter((l) => l.seller_id !== userId);
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter(Boolean) as string[])).sort();
    return {
      leagues: uniq(others.map((l) => l.league_name)),
      clubs: uniq(others.map((l) => l.club_name)),
      nations: uniq(others.map((l) => l.nationality)),
    };
  }, [listings, userId]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Opciones de los filtros: se arman con lo que hay publicado
  const { leagues, clubs, nations } = useMemo(() => {
    const lg = new Set<string>();
    const cl = new Set<string>();
    const na = new Set<string>();
    for (const l of listings) {
      if (l.league_name) lg.add(l.league_name);
      if (l.club_name) cl.add(l.club_name);
      if (l.nationality) na.add(l.nationality);
    }
    return {
      leagues: [...lg].sort(),
      clubs: [...cl].sort(),
      nations: [...na].sort(),
    };
  }, [listings]);

  /** Precio de referencia: lo que costaría llevárselo ahora. */
  const priceOf = (l: Listing) => l.buy_now ?? l.current_bid ?? l.start_price;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const max = maxPrice ? Number(maxPrice) : null;
    const list = listings.filter((l) => {
      if (l.seller_id === userId) return false;
      if (term && !l.player_name.toLowerCase().includes(term)) return false;
      if (rarity && l.rarity !== rarity) return false;
      if (fLeague && l.league_name !== fLeague) return false;
      if (fClub && l.club_name !== fClub) return false;
      if (fNation && l.nationality !== fNation) return false;
      if (max && priceOf(l) > max) return false;
      return true;
    });

    // El orden por antigüedad usa el vencimiento: las subastas duran
    // lo mismo, así que la que termina más tarde es la más reciente.
    const byEnd = (a: Listing, b: Listing) =>
      new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime();

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "cheap":
          return priceOf(a) - priceOf(b);
        case "expensive":
          return priceOf(b) - priceOf(a);
        case "old":
          return byEnd(a, b);
        default:
          return byEnd(b, a);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, search, rarity, maxPrice, fLeague, fClub, fNation, sortBy, userId]);

  /** Con puja encima: son las que están realmente disputadas. */
  const auctions = useMemo(
    () => filtered.filter((l) => l.current_bid != null),
    [filtered]
  );

  /** Lo que se muestra según la pestaña (los filtros aplican a las dos). */
  const shown = tab === "auctions" ? auctions : filtered;

  function openListing(l: Listing) {
    setSelected(l);
    const min = l.current_bid
      ? l.current_bid + Math.max(50, Math.floor(l.current_bid * 0.05))
      : l.start_price;
    setBidAmount(String(min));
    setError(null);
  }

  function doBid() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await placeBid(selected.id, Number(bidAmount));
      if (res.ok) {
        setBalance((b) => b - Number(bidAmount));
        setSelected(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo pujar.");
    });
  }

  function doBuy() {
    if (!selected?.buy_now) return;
    setError(null);
    start(async () => {
      const res = await buyNow(selected.id);
      if (res.ok) {
        setBalance((b) => b - (selected.buy_now ?? 0));
        setSelected(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo comprar.");
    });
  }

  function doCancel(l: Listing) {
    setError(null);
    start(async () => {
      const res = await cancelListing(l.id);
      if (res.ok) router.refresh();
      else setError(res.error ?? "No se pudo cancelar.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-e2">
        <Coins size={18} className="text-trophy" />
        <span className="text-sm text-muted">Tu saldo</span>
        <span className="ml-auto font-display text-xl font-extrabold tabular-nums">
          <Counter value={balance} />
        </span>
      </div>

      <Tabs
        tabs={[
          { value: "buy", label: "Comprar" },
          { value: "auctions", label: "Subastas", badge: auctions.length },
          { value: "mine", label: `Mis ventas (${mine.filter((m) => m.status === "active").length})` },
        ]}
        value={tab}
        onChange={(v) => setTab(v as "buy" | "auctions" | "mine")}
      />

      {error && (
        <Notice tone="error">{error}</Notice>
      )}

      {tab === "buy" || tab === "auctions" ? (
        <>
          <div className="space-y-2">
            <div className="relative">
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
            <div className="grid grid-cols-2 gap-2">
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                className="h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm focus:border-turf focus:outline-none"
              >
                <option value="">Rareza: todas</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_LABEL[r]}
                  </option>
                ))}
              </select>
              <Input
                inputMode="numeric"
                placeholder="Precio máx."
                value={maxPrice}
                onChange={(e) =>
                  setMaxPrice(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>

            {/* Liga · Club · Nacionalidad */}
            <div className="grid grid-cols-3 gap-2">
              <select
                value={fLeague}
                onChange={(e) => setFLeague(e.target.value)}
                className="h-10 truncate rounded-xl border border-border bg-surface-2 px-2 text-xs focus:border-turf focus:outline-none"
              >
                <option value="">Liga: todas</option>
                {opts.leagues.map((v) => (
                  <option key={v} value={v}>
                    {shortLeague(v)}
                  </option>
                ))}
              </select>
              <select
                value={fClub}
                onChange={(e) => setFClub(e.target.value)}
                className="h-10 truncate rounded-xl border border-border bg-surface-2 px-2 text-xs focus:border-turf focus:outline-none"
              >
                <option value="">Club: todos</option>
                {opts.clubs.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={fNation}
                onChange={(e) => setFNation(e.target.value)}
                className="h-10 truncate rounded-xl border border-border bg-surface-2 px-2 text-xs focus:border-turf focus:outline-none"
              >
                <option value="">País: todos</option>
                {opts.nations.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Orden */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  ["recent", "Más nuevos"],
                  ["old", "Más viejos"],
                  ["cheap", "Más baratos"],
                  ["expensive", "Más caros"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSortBy(v)}
                  className={cn(
                    "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold",
                    sortBy === v
                      ? "border-turf bg-turf-soft/30 text-turf"
                      : "border-border text-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              {tab === "auctions"
                ? "Todavía no hay subastas con pujas."
                : "No hay jugadores en venta con esos filtros."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {shown.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openListing(l)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 text-left transition hover:border-turf/50"
                >
                  <Portrait name={l.player_name} size={32} className="shrink-0  bg-bg" />
                  <span className="font-display w-7 shrink-0 text-center text-lg font-extrabold">
                    {l.overall}
                  </span>
                  <span className="w-8 shrink-0 text-center text-[11px] font-bold text-muted">
                    {l.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          RARITY_DOT[l.rarity]
                        )}
                      />
                      {l.player_name}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted">
                      <Flag nation={l.nationality} size={12} />
                      <ClubCrest club={l.club_name} size={11} showFallback={false} />
                      <span className="truncate">{l.club_name ?? "—"}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {/* Rojo = ya tiene puja encima (está en subasta) */}
                    <span
                      className={cn(
                        "block font-display text-sm font-extrabold",
                        l.current_bid != null ? "text-danger" : "text-trophy"
                      )}
                    >
                      {(l.current_bid ?? l.start_price).toLocaleString("es")}
                    </span>
                    <span className="flex items-center justify-end gap-0.5 text-[9px] text-muted">
                      {l.current_bid != null ? (
                        <>
                          <Gavel size={9} className="text-danger" /> en puja
                        </>
                      ) : (
                        <>
                          <Clock size={9} /> {timeLeft(l.ends_at)}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          {mine.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No publicaste ningún jugador. Podés hacerlo desde tu colección.
            </p>
          ) : (
            mine.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <span className="font-display w-7 text-center text-base font-extrabold">
                  {l.overall}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {l.player_name}
                  </span>
                  <span className="text-[10px] text-muted">
                    {l.status === "active"
                      ? `En venta · ${timeLeft(l.ends_at)}`
                      : l.status === "sold"
                        ? "Vendido"
                        : "Expirado"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-sm font-bold text-trophy">
                    {(l.current_bid ?? l.start_price).toLocaleString("es")}
                  </span>
                  {l.status === "active" && !l.current_bidder && (
                    <button
                      onClick={() => doCancel(l)}
                      disabled={pending}
                      className="text-[10px] text-danger hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Detalle de la subasta */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.player_name}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
              <Portrait name={selected.player_name} size={44} className="shrink-0  bg-bg" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold">
                  {selected.overall}{" "}
                  <span className="text-sm text-muted">{selected.position}</span>
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Flag nation={selected.nationality} size={12} />
                  <ClubCrest club={selected.club_name} size={12} showFallback={false} />
                  <span className="truncate">{selected.club_name ?? "—"}</span>
                </p>
              </div>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-bold",
                  RARITY_DOT[selected.rarity],
                  "text-bg"
                )}
              >
                {RARITY_LABEL[selected.rarity]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-border bg-surface-2 p-2">
                <p className="text-[10px] uppercase text-muted">Puja actual</p>
                <p className="font-display text-lg font-extrabold text-trophy">
                  {(selected.current_bid ?? selected.start_price).toLocaleString("es")}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-2">
                <p className="text-[10px] uppercase text-muted">Termina en</p>
                <p className="font-display text-lg font-extrabold">
                  {timeLeft(selected.ends_at)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted">
                Tu puja
              </label>
              <Input
                inputMode="numeric"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                fullWidth
                onClick={doBid}
                disabled={pending || Number(bidAmount) > balance}
              >
                <Gavel size={16} />
                {Number(bidAmount) > balance ? "Saldo insuficiente" : "Pujar"}
              </Button>
              {selected.buy_now && (
                <Button
                  fullWidth
                  variant="secondary"
                  onClick={doBuy}
                  disabled={pending || selected.buy_now > balance}
                >
                  <Zap size={16} />
                  Comprar ya por {selected.buy_now.toLocaleString("es")}
                </Button>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
