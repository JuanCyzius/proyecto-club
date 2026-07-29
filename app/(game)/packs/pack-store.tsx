"use client";

import { useEffect, useState, useTransition } from "react";
import { Counter } from "@/components/ui/counter";
import { Notice } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import { Coins, Sparkles, ChevronRight, HeartPulse, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RARITIES, RARITY_LABEL, type Rarity } from "@/lib/players";
import { Tabs } from "@/components/ui/tabs";
import { openPack, buyItem } from "./actions";
import type { PulledCard } from "./types";
import { PackOpening } from "./pack-opening";

export type ShopItem = {
  code: string;
  name: string;
  description: string | null;
  kind: "heal" | "stamina";
  power: number;
  price_coins: number;
  rarity: string;
};

type Pack = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_coins: number | null;
  drop_table: {
    size?: number;
    weights?: Record<string, number>;
    guaranteed?: { minRarity?: string }[];
  };
};

const RARITY_DOT: Record<Rarity, string> = {
  common: "bg-[#8a5a2b]",
  uncommon: "bg-[#aab7c2]",
  rare: "bg-[#ecc65e]",
  epic: "bg-[#6f86ff]",
  legendary: "bg-[#ff5b6e]",
  icon: "bg-[#f6e7b3]",
};

export function PackStore({
  packs,
  coins,
  items,
}: {
  packs: Pack[];
  coins: number;
  items: ShopItem[];
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(coins);
  // El saldo cambia en otras pantallas: se resincroniza con el real.
  useEffect(() => setBalance(coins), [coins]);
  const [tab, setTab] = useState<"packs" | "items">("packs");
  const [odds, setOdds] = useState<Pack | null>(null);
  const [pulled, setPulled] = useState<PulledCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function buy(p: Pack) {
    setError(null);
    setBusyId(p.id);
    const key = `${p.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    start(async () => {
      const res = await openPack(p.id, key);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBalance((b) => b - (p.price_coins ?? 0));
      setPulled(res.cards);
    });
  }

  function closeReveal() {
    setPulled(null);
    router.refresh();
  }


  return (
    <div className="space-y-4">
      {/* Saldo */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-e2">
        <Coins size={18} className="text-trophy" />
        <span className="text-sm text-muted">Tu saldo</span>
        <span className="ml-auto font-display text-xl font-extrabold tabular-nums">
          <Counter value={balance} />
        </span>
      </div>

      <Tabs
        tabs={[
          { value: "packs", label: "Sobres" },
          { value: "items", label: "Ítems" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as "packs" | "items")}
      />

      {error && (
        <Notice tone="error">{error}</Notice>
      )}

      {/* Tienda de ítems */}
      {tab === "items" &&
        items.map((it) => {
          const afford = balance >= it.price_coins;
          return (
            <Card key={it.code}>
              <CardBody className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    it.kind === "heal"
                      ? "bg-danger/15 text-danger"
                      : "bg-turf-soft text-turf"
                  )}
                >
                  {it.kind === "heal" ? (
                    <HeartPulse size={20} />
                  ) : (
                    <Package size={20} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{it.name}</span>
                  <span className="block text-[11px] text-muted">
                    {it.description}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={afford ? "primary" : "secondary"}
                  disabled={pending || !afford}
                  onClick={() => {
                    setError(null);
                    setBusyId(it.code);
                    start(async () => {
                      const res = await buyItem(it.code, 1);
                      setBusyId(null);
                      if (res.ok) {
                        setBalance((b) => b - it.price_coins);
                        router.refresh();
                      } else setError(res.error ?? "No se pudo comprar.");
                    });
                  }}
                >
                  <Coins size={14} />
                  {busyId === it.code
                    ? "…"
                    : it.price_coins.toLocaleString("es")}
                </Button>
              </CardBody>
            </Card>
          );
        })}

      {tab === "items" && (
        <p className="px-1 text-[11px] text-muted">
          Los ítems se usan desde tu colección. También salen dentro de los
          sobres.
        </p>
      )}

      {/* Sobres */}
      {tab === "packs" && packs.map((p) => {
        const price = p.price_coins ?? 0;
        const canAfford = balance >= price;
        return (
          <Card key={p.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start gap-3">
                <PackArt code={p.code} />
                <div className="flex-1">
                  <p className="font-display text-lg font-extrabold leading-tight">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{p.description}</p>
                  <button
                    onClick={() => setOdds(p)}
                    className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-turf"
                  >
                    Ver probabilidades <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <Button
                fullWidth
                onClick={() => buy(p)}
                disabled={pending || !canAfford}
                variant={canAfford ? "primary" : "secondary"}
              >
                <Coins size={16} />
                {busyId === p.id
                  ? "Abriendo…"
                  : canAfford
                    ? `Abrir por ${price.toLocaleString("es")}`
                    : `Necesitás ${price.toLocaleString("es")}`}
              </Button>
            </CardBody>
          </Card>
        );
      })}

      {/* Probabilidades */}
      <Modal
        open={!!odds}
        onClose={() => setOdds(null)}
        title={odds ? `Probabilidades · ${odds.name}` : ""}
      >
        {odds && <Odds pack={odds} />}
      </Modal>

      {/* Revelado con animación */}
      {pulled && pulled.length > 0 && (
        <PackOpening cards={pulled} onClose={closeReveal} />
      )}
    </div>
  );
}

function Odds({ pack }: { pack: Pack }) {
  const weights = pack.drop_table?.weights ?? {};
  const total = Object.values(weights).reduce((a, b) => a + Number(b), 0) || 1;
  const guaranteed = pack.drop_table?.guaranteed ?? [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {pack.drop_table?.size ?? 5} jugadores por sobre.
        {guaranteed.length > 0 && guaranteed[0]?.minRarity
          ? ` Incluye al menos 1 ${RARITY_LABEL[guaranteed[0].minRarity as Rarity]?.toLowerCase()} o mejor.`
          : ""}
      </p>
      <div className="space-y-2">
        {RARITIES.map((r) => {
          const pct = ((Number(weights[r] ?? 0) / total) * 100).toFixed(1);
          return (
            <div key={r} className="flex items-center gap-2 text-sm">
              <span className={cn("h-2.5 w-2.5 rounded-full", RARITY_DOT[r])} />
              <span className="flex-1">{RARITY_LABEL[r]}</span>
              <span className="tabular-nums font-semibold">{pct}%</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Porcentaje por carta. El resultado se decide y registra en el servidor.
      </p>
    </div>
  );
}

const PACK_STYLE: Record<string, string> = {
  bronze: "from-[#8a5a2b] to-[#5b3a1c]",
  silver: "from-[#aab7c2] to-[#6f7d89]",
  gold: "from-[#ecc65e] to-[#a9812f]",
  special: "from-[#6f86ff] to-[#2b348f]",
};

function PackArt({ code }: { code: string }) {
  return (
    <div
      className={cn(
        "flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b shadow-e2",
        PACK_STYLE[code] ?? "from-surface-2 to-surface"
      )}
    >
      <Sparkles size={18} className="text-white/70" />
    </div>
  );
}
