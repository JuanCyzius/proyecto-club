"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Clock, ShoppingBag, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Flag } from "@/components/ui/flag";
import { ClubCrest } from "@/components/club/club-crest";
import { Portrait } from "@/components/player-card/portrait";
import { Notice } from "@/components/ui/layout";
import { RARITY_LABEL, type Rarity } from "@/lib/players";
import { buyShopPlayer, type ShopSlot } from "./actions";

const RARITY_DOT: Record<string, string> = {
  common: "bg-[#8a5a2b]",
  uncommon: "bg-[#aab7c2]",
  rare: "bg-[#ecc65e]",
  epic: "bg-[#6f86ff]",
  legendary: "bg-[#ff5b6e]",
  icon: "bg-[#f6e7b3]",
};

/** 3 jugadores al azar que rotan cada 2 horas. */
export function ShopSection({
  slots,
  coins,
}: {
  slots: ShopSlot[];
  coins: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  if (slots.length === 0) return null;
  const mins = slots[0].expires_in_min;
  const rotLabel =
    mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

  function buy(slotId: number) {
    setError(null);
    setBusy(slotId);
    start(async () => {
      const res = await buyShopPlayer(slotId);
      setBusy(null);
      if (!res.ok) setError(res.error ?? "No se pudo comprar.");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-2xl border border-trophy/35 bg-trophy-soft/10 p-3">
      <div className="flex items-center gap-1.5">
        <ShoppingBag size={15} className="text-trophy" />
        <p className="flex-1 text-sm font-bold">Comprar jugadores</p>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <Clock size={11} /> rota en {rotLabel}
        </span>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {slots.map((s) => {
        const afford = coins >= s.price;
        return (
          <div
            key={s.slot_id}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2"
          >
            <Portrait name={s.name} size={36} className="shrink-0 bg-bg" />
            <span className="font-display w-8 shrink-0 text-center text-xl font-extrabold">
              {s.overall}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    RARITY_DOT[s.rarity] ?? "bg-muted"
                  )}
                />
                {s.name}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted">
                <Flag nation={s.nationality} size={11} />
                <ClubCrest club={s.club_name} size={11} showFallback={false} />
                <span className="truncate">
                  {s.position} · {RARITY_LABEL[s.rarity as Rarity] ?? s.rarity}
                </span>
              </span>
            </span>
            {s.already_bought ? (
              <span className="flex shrink-0 items-center gap-1 rounded-lg border border-turf/40 bg-turf-soft/20 px-2.5 py-1.5 text-xs font-bold text-turf">
                <Check size={13} /> Comprado
              </span>
            ) : (
              <button
                onClick={() => buy(s.slot_id)}
                disabled={pending || !afford}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-40",
                  afford
                    ? "border-trophy/50 bg-trophy/15 text-trophy"
                    : "border-border text-muted"
                )}
              >
                <Coins size={13} />
                {busy === s.slot_id ? "…" : s.price.toLocaleString("es")}
              </button>
            )}
          </div>
        );
      })}
      <p className="px-1 text-[10px] text-muted">
        Cada club ve jugadores distintos, al azar. Podés comprar cada uno
        una vez por rotación.
      </p>
    </div>
  );
}
