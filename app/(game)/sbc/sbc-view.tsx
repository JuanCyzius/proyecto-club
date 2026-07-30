"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Coins,
  Check,
  X,
  ChevronRight,
  Package,
  Clock,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice, EmptyState, Section } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Flag } from "@/components/ui/flag";
import { ClubCrest } from "@/components/club/club-crest";
import { Portrait } from "@/components/player-card/portrait";
import { teamChemistry, type ChemPlayer } from "@/lib/chemistry";
import { RARITIES, RARITY_LABEL, type Rarity } from "@/lib/players";
import { submitSbc, type SbcCard, type SbcChallenge, type SbcRequirements } from "./actions";

const PACK_LABEL: Record<string, string> = {
  bronze: "Sobre Bronce",
  silver: "Sobre Plata",
  gold: "Sobre Oro",
  special: "Sobre Especial",
};
const KIND_LABEL: Record<string, string> = {
  daily: "Del día",
  hard: "Difícil",
  fixed: "Siempre",
};
const rIdx = (r: Rarity) => RARITIES.indexOf(r);
const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/** Estado en vivo de cada requisito para pintar la checklist. */
function liveChecks(req: SbcRequirements, picked: SbcCard[]) {
  const out: { label: string; ok: boolean }[] = [];
  out.push({
    label: `${picked.length}/${req.size} jugadores`,
    ok: picked.length === req.size,
  });
  const avg =
    picked.length > 0
      ? Math.round(picked.reduce((s, c) => s + c.overall, 0) / picked.length)
      : 0;
  if (req.min_avg)
    out.push({ label: `Media ${avg} (pide ${req.min_avg}+)`, ok: avg >= req.min_avg && picked.length === req.size });
  if (req.min_chem) {
    const squad: ChemPlayer[] = picked.map((c) => ({
      cardPos: c.position,
      slotPos: c.position,
      club: c.club_name,
      league: c.league_name,
      nation: c.nationality,
    }));
    const chem = picked.length > 0 ? teamChemistry(squad) : 0;
    out.push({ label: `Química ${chem} (pide ${req.min_chem}+)`, ok: chem >= req.min_chem && picked.length === req.size });
  }
  if (req.max_rarity)
    out.push({
      label: `Solo hasta ${RARITY_LABEL[req.max_rarity]?.toLowerCase()}`,
      ok: picked.every((c) => rIdx(c.rarity) <= rIdx(req.max_rarity!)),
    });
  if (req.rarity_min) {
    const n = picked.filter((c) => rIdx(c.rarity) >= rIdx(req.rarity_min!.rarity)).length;
    out.push({
      label: `${n}/${req.rarity_min.count} de ${RARITY_LABEL[req.rarity_min.rarity]?.toLowerCase()} o mejor`,
      ok: n >= req.rarity_min.count,
    });
  }
  for (const [r, get, tag] of [
    [req.nation, (c: SbcCard) => c.nationality, ""],
    [req.league, (c: SbcCard) => c.league_name, ""],
    [req.club, (c: SbcCard) => c.club_name, ""],
  ] as const) {
    if (r) {
      const n = picked.filter((c) => norm(get(c)) === norm(r.name)).length;
      out.push({ label: `${n}/${r.count} de ${r.name}${tag}`, ok: n >= r.count });
    }
  }
  return out;
}

export function SbcView({
  challenges,
  cards,
}: {
  challenges: SbcChallenge[];
  cards: SbcCard[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<SbcChallenge | null>(null);
  const [picked, setPicked] = useState<SbcCard[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ coins: number; packs: string[] } | null>(null);
  const [pending, start] = useTransition();

  const available = useMemo(() => {
    const used = new Set(picked.map((p) => p.id));
    return cards
      .filter((c) => !used.has(c.id))
      .sort((a, b) => a.overall - b.overall);
  }, [cards, picked]);

  const checks = open ? liveChecks(open.requirements, picked) : [];
  const allOk = checks.length > 0 && checks.every((c) => c.ok);

  function begin(ch: SbcChallenge) {
    setOpen(ch);
    setPicked([]);
    setConfirm(false);
    setError(null);
    setDone(null);
  }

  function submit() {
    if (!open) return;
    setError(null);
    start(async () => {
      const res = await submitSbc(open.id, picked.map((p) => p.id));
      if (res.ok) {
        setDone({ coins: res.coins, packs: res.packs });
        setConfirm(false);
        router.refresh();
      } else {
        setError(res.error);
        setConfirm(false);
      }
    });
  }

  const groups: ["daily" | "hard" | "fixed", string][] = [
    ["daily", "Del día (rotan cada 24 hs)"],
    ["hard", "Difícil (rota cada 3 días)"],
    ["fixed", "Siempre disponibles"],
  ];

  return (
    <div className="space-y-4">
      {groups.map(([kind, label]) => {
        const list = challenges.filter((c) => c.kind === kind);
        if (list.length === 0) return null;
        return (
          <Section key={kind} label={label}>
            <div className="space-y-2">
              {list.map((c) => {
                const blocked = !c.repeatable && c.done_count > 0;
                return (
                  <button
                    key={c.id}
                    disabled={blocked}
                    onClick={() => begin(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left",
                      blocked
                        ? "border-border bg-surface opacity-60"
                        : "border-border bg-surface hover:border-turf/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        kind === "hard"
                          ? "bg-danger/15 text-danger"
                          : kind === "daily"
                            ? "bg-turf-soft text-turf"
                            : "bg-surface-2 text-muted"
                      )}
                    >
                      {kind === "daily" ? <Clock size={18} /> : <ClipboardCheck size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        {c.title}
                        {c.repeatable && (
                          <RotateCcw size={11} className="text-muted" />
                        )}
                        {blocked && <Check size={13} className="text-turf" />}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {c.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {c.reward_coins > 0 && (
                        <span className="flex items-center justify-end gap-1 text-sm font-bold text-trophy">
                          <Coins size={12} /> {c.reward_coins.toLocaleString("es")}
                        </span>
                      )}
                      {c.reward_packs.map((p) => (
                        <span key={p} className="block text-[10px] text-muted">
                          + {PACK_LABEL[p] ?? p}
                        </span>
                      ))}
                    </span>
                    {!blocked && (
                      <ChevronRight size={15} className="shrink-0 text-muted-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        );
      })}

      {challenges.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title="Sin desafíos"
          description="Falta ejecutar la migración 0039_desafios_plantilla.sql."
        />
      )}

      {/* ── Armado del desafío ── */}
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title ?? ""}
      >
        {open && done && (
          <div className="space-y-3 text-center">
            <p className="font-display text-xl font-extrabold text-turf">
              ¡Desafío completado!
            </p>
            {done.coins > 0 && (
              <p className="font-display text-2xl font-extrabold text-trophy">
                +{done.coins.toLocaleString("es")} monedas
              </p>
            )}
            {done.packs.length > 0 && (
              <p className="flex items-center justify-center gap-1 text-sm text-muted">
                <Package size={14} />
                {done.packs.map((p) => PACK_LABEL[p] ?? p).join(" + ")} — abrilo
                gratis desde la Tienda
              </p>
            )}
            <Button fullWidth onClick={() => setOpen(null)}>
              Listo
            </Button>
          </div>
        )}

        {open && !done && (
          <div className="space-y-3">
            {/* Checklist en vivo */}
            <div className="space-y-1 rounded-xl border border-border bg-surface-2 p-2.5">
              {checks.map((c, i) => (
                <p key={i} className="flex items-center gap-1.5 text-xs">
                  {c.ok ? (
                    <Check size={13} className="shrink-0 text-turf" />
                  ) : (
                    <X size={13} className="shrink-0 text-danger" />
                  )}
                  <span className={c.ok ? "text-text" : "text-muted"}>
                    {c.label}
                  </span>
                </p>
              ))}
            </div>

            {error && <Notice tone="error">{error}</Notice>}

            {/* Elegidos */}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setPicked((p) => p.filter((x) => x.id !== c.id))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-turf/40 bg-turf-soft/20 px-2 py-1 text-xs"
                  >
                    <b className="font-display">{c.overall}</b>
                    <span className="max-w-24 truncate">{c.name}</span>
                    <X size={11} className="text-muted" />
                  </button>
                ))}
              </div>
            )}

            {/* Entregar */}
            {confirm ? (
              <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-danger">
                  <AlertTriangle size={13} /> Los {picked.length} jugadores se
                  pierden para siempre. ¿Confirmás?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setConfirm(false)}>
                    Cancelar
                  </Button>
                  <Button disabled={pending} onClick={submit}>
                    {pending ? "Entregando…" : "Sí, entregar"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                fullWidth
                disabled={!allOk || pending}
                onClick={() => setConfirm(true)}
              >
                <ClipboardCheck size={16} />
                {allOk ? "Entregar equipo" : "Faltan requisitos"}
              </Button>
            )}

            {/* Colección disponible */}
            <p className="eyebrow px-1">
              Tu colección ({available.length}) — los del once no aparecen
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {available.map((c) => (
                <button
                  key={c.id}
                  disabled={picked.length >= open.requirements.size}
                  onClick={() => setPicked((p) => [...p, c])}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left disabled:opacity-40"
                >
                  <Portrait name={c.name} size={26} className="shrink-0 bg-bg" />
                  <span className="font-display w-7 shrink-0 text-center text-base font-extrabold">
                    {c.overall}
                  </span>
                  <span className="w-8 shrink-0 text-center text-[10px] font-bold text-muted">
                    {c.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {c.name}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted">
                      <Flag nation={c.nationality} size={11} />
                      <ClubCrest club={c.club_name} size={11} showFallback={false} />
                      <span className="truncate">
                        {RARITY_LABEL[c.rarity]} · {c.club_name ?? "—"}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              {available.length === 0 && (
                <p className="py-4 text-center text-xs text-muted">
                  No te quedan cartas disponibles.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
