"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Flag } from "@/components/ui/flag";
import { Counter } from "@/components/ui/counter";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import { Coins, Lock, Shirt, HeartPulse, Package, Store, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { PlayerCard } from "@/components/player-card/player-card";
import { ClubCrest, clubLogo } from "@/components/club/club-crest";
import { RARITY_LABEL, type OwnedCard, type Rarity } from "@/lib/players";
import { quickSell, applyItemToCard, quickSellMany } from "./actions";
import { listCard, quickList } from "../market/actions";

export type CollectionCard = OwnedCard & {
  bound: boolean;
  inSquad: boolean;
  injuryType?: string | null;
  injuryMatches?: number;
};

export type InventoryItem = {
  code: string;
  qty: number;
  name: string;
  description: string;
  kind: "heal" | "stamina";
  power: number;
};

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, icon: 5,
};

export function CollectionList({
  cards,
  coins,
  inventory,
}: {
  cards: CollectionCard[];
  coins: number;
  inventory: InventoryItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"players" | "items">("players");
  const [balance, setBalance] = useState(coins);
  // El saldo cambia en otras pantallas: se resincroniza con el real.
  useEffect(() => setBalance(coins), [coins]);
  const [sort, setSort] = useState<"overall" | "rarity" | "position">("overall");
  const [selected, setSelected] = useState<CollectionCard | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [startPrice, setStartPrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Modo descarte: seleccionar varios y venderlos de una vez.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...cards];
    if (sort === "overall") arr.sort((a, b) => b.overall - a.overall);
    if (sort === "rarity")
      arr.sort(
        (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.overall - a.overall
      );
    if (sort === "position")
      arr.sort((a, b) => a.position.localeCompare(b.position) || b.overall - a.overall);
    return arr;
  }, [cards, sort]);

  const injured = cards.filter((c) => (c.injuryMatches ?? 0) > 0);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function discardPicked() {
    if (picked.size === 0) return;
    setError(null);
    start(async () => {
      const res = await quickSellMany([...picked]);
      if (res.ok) {
        setBalance((b) => b + (res.coins ?? 0));
        setMsg(`${res.sold} jugadores descartados · +${(res.coins ?? 0).toLocaleString("es")} monedas`);
        setPicked(new Set());
        setPicking(false);
        router.refresh();
      } else setError(res.error ?? "No se pudo descartar.");
    });
  }

  // Valor aproximado de lo seleccionado, para decidir sin sorpresas
  const pickedValue = useMemo(() => {
    const V: Record<string, number> = {
      common: 40, uncommon: 110, rare: 280,
      epic: 750, legendary: 1800, icon: 4500,
    };
    return cards
      .filter((c) => picked.has(c.id))
      .reduce((s, c) => s + V[c.rarity] + Math.max(0, c.overall - 60) * 5, 0);
  }, [cards, picked]);

  function sell(card: CollectionCard) {
    setError(null);
    start(async () => {
      const res = await quickSell(card.id);
      if (res.ok) {
        setBalance((b) => b + (res.value ?? 0));
        setSelected(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo vender.");
    });
  }

  function publish() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await listCard(
        selected.id,
        Number(startPrice),
        buyNowPrice ? Number(buyNowPrice) : null,
        8
      );
      if (res.ok) {
        setSellOpen(false);
        setSelected(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo publicar.");
    });
  }

  function applyItem(code: string, cardId: string) {
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await applyItemToCard(code, cardId);
      if (res.ok) {
        setMsg("Ítem aplicado.");
        setSelected(null);
        router.refresh();
      } else setError(res.error ?? "No se pudo usar el ítem.");
    });
  }

  const healItems = inventory.filter((i) => i.kind === "heal");
  const stamItems = inventory.filter((i) => i.kind === "stamina");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-e2">
        <Coins size={18} className="text-trophy" />
        <span className="text-sm text-muted">Saldo</span>
        <span className="ml-auto font-display text-xl font-extrabold tabular-nums">
          <Counter value={balance} />
        </span>
      </div>

      <Tabs
        tabs={[
          { value: "players", label: `Jugadores (${cards.length})` },
          {
            value: "items",
            label: `Ítems (${inventory.reduce((s, i) => s + i.qty, 0)})`,
          },
        ]}
        value={tab}
        onChange={(v) => setTab(v as "players" | "items")}
      />

      {error && (
        <Notice tone="error">{error}</Notice>
      )}
      {msg && (
        <Notice tone="success">{msg}</Notice>
      )}

      {tab === "items" ? (
        <div className="space-y-3">
          {inventory.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No tenés ítems. Salen en los sobres o se compran en la tienda.
            </p>
          ) : (
            inventory.map((it) => (
              <div
                key={it.code}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    it.kind === "heal"
                      ? "bg-danger/15 text-danger"
                      : "bg-turf-soft text-turf"
                  )}
                >
                  {it.kind === "heal" ? (
                    <HeartPulse size={17} />
                  ) : (
                    <Package size={17} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{it.name}</span>
                  <span className="block text-[11px] text-muted">
                    {it.description}
                  </span>
                </span>
                <span className="font-display text-lg font-extrabold text-trophy">
                  ×{it.qty}
                </span>
              </div>
            ))
          )}
          <p className="px-1 text-[11px] text-muted">
            Para usarlos, tocá un jugador en la pestaña Jugadores.
          </p>
        </div>
      ) : (
        <>
          {injured.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <HeartPulse size={15} /> {injured.length} jugador
                {injured.length > 1 ? "es" : ""} lesionado
                {injured.length > 1 ? "s" : ""}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPicking((v) => !v);
                setPicked(new Set());
                setError(null);
                setMsg(null);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors",
                picking
                  ? "border-danger/40 bg-danger-soft text-danger"
                  : "border-border bg-surface text-muted hover:text-text"
              )}
            >
              <Trash2 size={14} />
              {picking ? "Cancelar" : "Descartar varios"}
            </button>
            {picking && (
              <span className="text-xs text-muted">
                {picked.size} elegidos
              </span>
            )}
          </div>

          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(
              [
                ["overall", "Media"],
                ["rarity", "Rareza"],
                ["position", "Posición"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setSort(v)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  sort === v ? "bg-turf text-turf-ink" : "text-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {sorted.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Todavía no tenés jugadores. Abrí un sobre para empezar.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((c) => {
                const inj = (c.injuryMatches ?? 0) > 0;
                const st = typeof c.stamina === "number" ? c.stamina : 100;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (picking) {
                        // Titulares, lesionados y vinculados no se descartan
                        if (c.inSquad || c.bound || inj) return;
                        toggle(c.id);
                        return;
                      }
                      setSelected(c);
                      setError(null);
                      setMsg(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border bg-surface px-2.5 py-2 text-left transition hover:border-turf/50",
                      picked.has(c.id) && "border-danger bg-danger-soft/40",
                      picking && (c.inSquad || c.bound || inj) && "opacity-40",
                      !picked.has(c.id) && (inj ? "border-danger/40" : "border-border")
                    )}
                  >
                    <span className="font-display w-7 shrink-0 text-center text-lg font-extrabold">
                      {c.overall}
                    </span>
                    <span className="w-8 shrink-0 text-center text-[11px] font-bold text-muted">
                      {c.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {c.name}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted">
                        <Flag nation={c.nationality} size={12} />
                        <ClubCrest club={c.clubName} size={11} showFallback={false} />
                        <span className="truncate">{c.clubName ?? "—"}</span>
                      </span>
                    </span>
                    {inj && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                        <HeartPulse size={10} /> {c.injuryMatches}
                      </span>
                    )}
                    {c.inSquad && <Shirt size={14} className="shrink-0 text-turf" />}
                    {c.bound && <Lock size={14} className="shrink-0 text-muted" />}
                    <span
                      className={cn(
                        "w-9 shrink-0 text-right text-[11px] font-bold tabular-nums",
                        st >= 85 ? "text-turf" : st >= 65 ? "text-trophy" : "text-danger"
                      )}
                    >
                      {Math.round(st)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Barra de descarte */}
      {picking && picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 animate-fade-up px-4 pb-2">
          <div className="mx-auto flex max-w-app items-center gap-3 rounded-2xl border border-danger/40 bg-surface px-3 py-2.5 shadow-e3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">
                {picked.size} jugador{picked.size > 1 ? "es" : ""}
              </span>
              <span className="text-[11px] text-muted">
                Recibís {pickedValue.toLocaleString("es")} monedas
              </span>
            </span>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={discardPicked}
            >
              <Trash2 size={14} />
              {pending ? "…" : "Descartar"}
            </Button>
          </div>
        </div>
      )}

      {/* Detalle del jugador */}
      <Modal
        open={!!selected && !sellOpen}
        onClose={() => setSelected(null)}
        title={selected?.name}
      >
        {selected && (
          <div className="space-y-4">
            <div className="mx-auto w-40">
              <PlayerCard
                player={{
                  ...selected,
                  gkAttributes: selected.gkAttributes ?? null,
                  clubLogo: clubLogo(selected.clubName),
                }}
              />
            </div>
            <p className="text-center text-sm text-muted">
              {selected.position} · {RARITY_LABEL[selected.rarity]}
              {selected.clubName ? ` · ${selected.clubName}` : ""}
            </p>

            {/* Estado */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-border bg-surface-2 p-2">
                <p className="text-[10px] uppercase text-muted">Energía</p>
                <p
                  className={cn(
                    "font-display text-lg font-extrabold",
                    (selected.stamina ?? 100) >= 85 ? "text-turf" : "text-trophy"
                  )}
                >
                  {Math.round(selected.stamina ?? 100)}%
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-2">
                <p className="text-[10px] uppercase text-muted">Estado</p>
                <p
                  className={cn(
                    "font-display text-lg font-extrabold",
                    (selected.injuryMatches ?? 0) > 0 ? "text-danger" : "text-turf"
                  )}
                >
                  {(selected.injuryMatches ?? 0) > 0
                    ? `${selected.injuryMatches} part.`
                    : "Apto"}
                </p>
              </div>
            </div>

            {/* Ítems aplicables */}
            {(selected.injuryMatches ?? 0) > 0 && healItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted">Curar lesión</p>
                {healItems.map((it) => {
                  const enough = it.power >= (selected.injuryMatches ?? 0);
                  return (
                    <button
                      key={it.code}
                      onClick={() => applyItem(it.code, selected.id)}
                      disabled={pending || !enough}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-40",
                        enough
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : "border-border text-muted"
                      )}
                    >
                      <HeartPulse size={15} />
                      <span className="flex-1 text-left">{it.name}</span>
                      <span className="font-bold">×{it.qty}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(selected.stamina ?? 100) < 100 && stamItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted">
                  Recuperar energía
                </p>
                {stamItems.map((it) => (
                  <button
                    key={it.code}
                    onClick={() => applyItem(it.code, selected.id)}
                    disabled={pending}
                    className="flex w-full items-center gap-2 rounded-lg border border-turf/40 bg-turf-soft/30 px-3 py-2 text-sm text-turf disabled:opacity-40"
                  >
                    <Package size={15} />
                    <span className="flex-1 text-left">
                      {it.name} (+{it.power})
                    </span>
                    <span className="font-bold">×{it.qty}</span>
                  </button>
                ))}
              </div>
            )}

            {selected.inSquad && (
              <p className="rounded-lg border border-turf/30 bg-turf-soft/30 px-3 py-2 text-center text-xs text-turf">
                Está en tu plantilla. Sacalo del once para venderlo.
              </p>
            )}

            {!selected.bound && !selected.inSquad && (
              <div className="space-y-2">
                <Button
                  fullWidth
                  disabled={pending || (selected.injuryMatches ?? 0) > 0}
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const res = await quickList(selected.id);
                      if (res.ok) {
                        setSelected(null);
                        setMsg(
                          `Publicado al precio sugerido (${(res.price ?? 0).toLocaleString("es")}).`
                        );
                        router.refresh();
                      } else setError(res.error ?? "No se pudo publicar.");
                    });
                  }}
                >
                  <Zap size={16} />
                  {pending ? "Publicando…" : "Vender al precio sugerido"}
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  onClick={() => {
                    setSellOpen(true);
                    setStartPrice("");
                    setBuyNowPrice("");
                  }}
                  disabled={pending || (selected.injuryMatches ?? 0) > 0}
                >
                  <Store size={16} /> Elegir precio
                </Button>
                <Button
                  fullWidth
                  variant="danger"
                  onClick={() => sell(selected)}
                  disabled={pending}
                >
                  <Coins size={16} /> Venta rápida
                </Button>
              </div>
            )}
            {selected.bound && (
              <p className="text-center text-xs text-muted">
                Carta vinculada: no se puede vender.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Publicar en el mercado */}
      <Modal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        title="Publicar en el mercado"
      >
        {selected && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {selected.name} · {selected.overall} {selected.position}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Precio inicial
              </label>
              <Input
                inputMode="numeric"
                placeholder="Ej. 1200"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Compra inmediata (opcional)
              </label>
              <Input
                inputMode="numeric"
                placeholder="Ej. 3000"
                value={buyNowPrice}
                onChange={(e) => setBuyNowPrice(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <p className="text-[11px] text-muted">
              La subasta dura 8 horas. Al venderse se descuenta un 5% de
              impuesto.
            </p>
            <Button fullWidth onClick={publish} disabled={pending || !startPrice}>
              {pending ? "Publicando…" : "Publicar"}
            </Button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
