"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Hand,
  Coins,
  Swords,
  Trophy,
  X,
  ChevronRight,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Notice, List, Row, EmptyState, StatTile, Chip } from "@/components/ui/layout";
import { ClubCrest } from "@/components/club/club-crest";
import { Avatar } from "@/components/ui/avatar";
import { coins as fmt } from "@/lib/format";
import { RARITY_LABEL, type Rarity } from "@/lib/players";
import { GoalGrid, coveredZones } from "./goal-grid";
import {
  cancelDuel,
  createDuel,
  myWagerableCards,
  playDuel,
  type DuelHistory,
  type DuelResult,
  type OpenDuel,
  type WagerCard,
} from "./actions";

const ROUNDS = 7; // 5 + 2 de muerte súbita

type Phase = "list" | "shots" | "dives" | "wager" | "playing" | "result";

export function DuelsView({
  open,
  history,
  coins,
  level,
  userId,
}: {
  open: OpenDuel[];
  history: DuelHistory[];
  coins: number;
  level: number;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "history">("open");
  const [phase, setPhase] = useState<Phase>("list");
  const [target, setTarget] = useState<OpenDuel | null>(null); // null = crear

  const [shots, setShots] = useState<number[]>([]);
  const [dives, setDives] = useState<number[]>([]);
  const [stake, setStake] = useState("0");
  const [wagerKind, setWagerKind] = useState<"none" | "coins" | "card">("none");
  const [cards, setCards] = useState<WagerCard[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);

  const [result, setResult] = useState<DuelResult | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const myZones = 4; // referencia visual; el valor real depende del rival

  function reset() {
    setPhase("list");
    setTarget(null);
    setShots([]);
    setDives([]);
    setStake("0");
    setWagerKind("none");
    setCardId(null);
    setResult(null);
    setStep(0);
    setError(null);
  }

  function beginCreate() {
    reset();
    setPhase("shots");
  }

  function beginAccept(d: OpenDuel) {
    reset();
    setTarget(d);
    setPhase("shots");
    if (d.stake_rarity) {
      setWagerKind("card");
      myWagerableCards(d.stake_rarity).then(setCards);
    } else if (d.stake_coins > 0) {
      setWagerKind("coins");
      setStake(String(d.stake_coins));
    }
  }

  function pickZone(z: number) {
    if (phase === "shots") {
      const next = [...shots, z];
      setShots(next);
      if (next.length === ROUNDS) setPhase("dives");
    } else if (phase === "dives") {
      const next = [...dives, z];
      setDives(next);
      if (next.length === ROUNDS) {
        // Al aceptar un duelo ya sabemos la apuesta: se juega directo
        setPhase(target ? "wager" : "wager");
      }
    }
  }

  function submit() {
    setError(null);
    const coinsBet = wagerKind === "coins" ? Number(stake) || 0 : 0;
    const card = wagerKind === "card" ? cardId : null;

    if (wagerKind === "card" && !card) {
      setError("Elegí el jugador que vas a apostar.");
      return;
    }

    start(async () => {
      if (target) {
        const res = await playDuel(target.id, shots, dives, card);
        if (res.ok) {
          setResult(res.result);
          setStep(0);
          setPhase("result");
          router.refresh();
        } else setError(res.error);
      } else {
        const res = await createDuel(shots, dives, coinsBet, card);
        if (res.ok) {
          reset();
          router.refresh();
        } else setError(res.error ?? "No se pudo crear el duelo.");
      }
    });
  }

  // Reproducción automática de la tanda
  useEffect(() => {
    if (phase !== "result" || !result) return;
    if (step >= result.rounds.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 2600);
    return () => clearTimeout(t);
  }, [phase, result, step]);

  // ── Elegir disparos o atajadas ──
  if (phase === "shots" || phase === "dives") {
    const isShots = phase === "shots";
    const done = isShots ? shots.length : dives.length;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-2">
            {isShots ? (
              <Target size={16} className="text-turf" />
            ) : (
              <Hand size={16} className="text-trophy" />
            )}
            <span className="text-sm font-bold">
              {isShots ? "Tus 7 disparos" : "Tus 7 atajadas"}
            </span>
            <span className="ml-auto font-display text-lg font-extrabold tabular-nums">
              {done}/{ROUNDS}
            </span>
          </div>
          <p className="text-xs leading-snug text-muted">
            {isShots
              ? "Elegí dónde vas a patear en cada ronda. El arquero rival no sabe cuál elegiste."
              : "Elegí dónde se tira tu arquero. Cubre esa zona y las de al lado, según tu nivel."}
          </p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <GoalGrid
          mode="pick"
          selected={null}
          onSelect={pickZone}
          covered={!isShots ? coveredZones(0, myZones) : undefined}
          label={`Ronda ${done + 1}`}
        />

        {/* Progreso de las elecciones */}
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 w-6 rounded-full",
                i < done ? (isShots ? "bg-turf" : "bg-trophy") : "bg-surface-2"
              )}
            />
          ))}
        </div>

        <p className="text-center text-[11px] text-muted">
          Las rondas 6 y 7 se usan solo si hay muerte súbita.
        </p>

        <Button fullWidth variant="secondary" onClick={reset}>
          Cancelar
        </Button>
      </div>
    );
  }

  // ── Elegir la apuesta ──
  if (phase === "wager") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-sm font-bold">
            {target ? "Igualá la apuesta" : "¿Querés apostar algo?"}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted">
            {target
              ? "Para aceptar el duelo tenés que poner lo mismo que el retador."
              : "Podés jugar sin apostar. Si apostás, el rival tendrá que igualarlo."}
          </p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        {!target && (
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(
              [
                ["none", "Sin apuesta"],
                ["coins", "Monedas"],
                ["card", "Jugador"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setWagerKind(v);
                  setCardId(null);
                  if (v === "card" && cards.length === 0)
                    myWagerableCards().then(setCards);
                }}
                className={cn(
                  "flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors",
                  wagerKind === v ? "bg-turf text-turf-ink" : "text-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {wagerKind === "coins" && (
          <Field label="Monedas" hint={`Tenés ${fmt(coins)}`}>
            <Input
              inputMode="numeric"
              value={stake}
              disabled={!!target}
              onChange={(e) => setStake(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}

        {wagerKind === "card" && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-muted">
              {target
                ? `Elegí un jugador ${RARITY_LABEL[target.stake_rarity as Rarity] ?? target.stake_rarity}`
                : "Elegí el jugador que apostás"}
            </p>
            {cards.length === 0 ? (
              <Notice>
                No tenés jugadores disponibles
                {target ? ` de esa rareza` : ""}. Tienen que estar fuera del
                once, sanos y sin vincular.
              </Notice>
            ) : (
              <List className="max-h-64 overflow-y-auto">
                {cards.map((c) => (
                  <Row
                    key={c.card_id}
                    onClick={() => setCardId(c.card_id)}
                    active={cardId === c.card_id}
                  >
                    <span className="font-display w-7 shrink-0 text-center text-base font-extrabold">
                      {c.overall}
                    </span>
                    <span className="w-8 shrink-0 text-center text-[11px] text-muted">
                      {c.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c.player_name}
                    </span>
                    <Chip>{RARITY_LABEL[c.rarity as Rarity] ?? c.rarity}</Chip>
                  </Row>
                ))}
              </List>
            )}
          </div>
        )}

        <Button
          fullWidth
          size="lg"
          disabled={
            pending ||
            (wagerKind === "coins" && Number(stake) > coins) ||
            (wagerKind === "card" && !cardId)
          }
          onClick={submit}
        >
          <Swords size={17} />
          {pending
            ? "Enviando…"
            : target
              ? "Jugar la tanda"
              : "Publicar el desafío"}
        </Button>
        <Button fullWidth variant="ghost" onClick={reset}>
          Cancelar
        </Button>
      </div>
    );
  }

  // ── Reproducción de la tanda ──
  if (phase === "result" && result) {
    const r = result.rounds[Math.min(step, result.rounds.length - 1)];
    const finished = step >= result.rounds.length;
    // El que acepta es siempre "opponent" en los datos
    const myGoal = r?.opponent_goal;
    const myScore = finished ? result.opponent_score : (r?.score[1] ?? 0);
    const rivalScore = finished ? result.challenger_score : (r?.score[0] ?? 0);

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="eyebrow">
            {finished ? "Final" : `Ronda ${r?.round ?? 1}`}
          </p>
          <p className="font-display text-4xl font-extrabold tabular-nums">
            {myScore}
            <span className="mx-2 text-muted">-</span>
            {rivalScore}
          </p>
          <p className="text-xs text-muted">vos · rival</p>
        </div>

        {!finished && r && (
          <>
            <GoalGrid
              mode="reveal"
              shot={r.opponent_shot}
              keeperAt={r.challenger_dive}
              covered={coveredZones(r.challenger_dive, r.challenger_zones)}
              isGoal={r.opponent_goal}
              label="Tu penal"
            />
            <p
              className={cn(
                "text-center text-sm font-bold",
                myGoal ? "text-turf" : "text-danger"
              )}
            >
              {myGoal ? "¡Gol!" : "Atajó el arquero"}
            </p>
          </>
        )}

        {finished && (
          <div
            className={cn(
              "animate-scale-in rounded-2xl border p-5 text-center",
              result.you_won
                ? "border-turf/50 bg-turf-soft/30"
                : "border-danger/50 bg-danger-soft"
            )}
          >
            <Trophy
              size={28}
              className={cn(
                "mx-auto",
                result.you_won ? "text-turf" : "text-danger"
              )}
            />
            <p
              className={cn(
                "mt-2 font-display text-2xl font-extrabold",
                result.you_won ? "text-turf" : "text-danger"
              )}
            >
              {result.you_won ? "¡Ganaste!" : "Perdiste"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Tu arquero cubría {result.your_keeper_zones} de 8 zonas · el rival,{" "}
              {result.rival_keeper_zones}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {!finished && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setStep(result.rounds.length)}
            >
              Saltar
            </Button>
          )}
          {finished && (
            <Button fullWidth size="lg" onClick={reset}>
              Volver
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Listado ──
  const mine = open.filter((d) => d.is_mine);
  const others = open.filter((d) => !d.is_mine);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile icon={Layers} label="Tu nivel" value={level} accent="turf" />
        <StatTile label="Desafíos" value={others.length} />
        <StatTile
          icon={Trophy}
          label="Ganados"
          value={history.filter((h) => h.won).length}
          accent="trophy"
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button fullWidth size="lg" onClick={beginCreate}>
        <Target size={17} /> Crear desafío
      </Button>

      <Tabs
        tabs={[
          { value: "open", label: "Desafíos", badge: others.length },
          { value: "history", label: "Historial" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as "open" | "history")}
      />

      {tab === "open" ? (
        <>
          {mine.length > 0 && (
            <List>
              {mine.map((d) => (
                <Row key={d.id}>
                  <Chip tone="turf">Tuyo</Chip>
                  <span className="min-w-0 flex-1 text-sm text-muted">
                    Esperando rival
                    {d.stake_coins > 0 && ` · ${fmt(d.stake_coins)} monedas`}
                    {d.stake_rarity &&
                      ` · 1 ${RARITY_LABEL[d.stake_rarity as Rarity] ?? d.stake_rarity}`}
                  </span>
                  <button
                    onClick={() =>
                      start(async () => {
                        const res = await cancelDuel(d.id);
                        if (res.ok) router.refresh();
                        else setError(res.error ?? "No se pudo cancelar.");
                      })
                    }
                    className="shrink-0 text-xs font-semibold text-danger"
                  >
                    Cancelar
                  </button>
                </Row>
              ))}
            </List>
          )}

          {others.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No hay desafíos abiertos"
              description="Creá uno y esperá a que alguien lo acepte, o volvé más tarde."
            />
          ) : (
            <List>
              {others.map((d) => (
                <Row key={d.id} onClick={() => beginAccept(d)}>
                  {d.crest_club ? (
                    <ClubCrest club={d.crest_club} size={34} />
                  ) : (
                    <Avatar
                      label={d.club_name}
                      className="h-[34px] w-[34px] text-xs"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {d.club_name}
                    </span>
                    <span className="text-[11px] text-muted">
                      @{d.username} · Nivel {d.challenger_level}
                    </span>
                  </span>
                  {d.stake_coins > 0 && (
                    <Chip tone="trophy">
                      <Coins size={9} /> {fmt(d.stake_coins)}
                    </Chip>
                  )}
                  {d.stake_rarity && (
                    <Chip tone="turf">
                      1 {RARITY_LABEL[d.stake_rarity as Rarity] ?? d.stake_rarity}
                    </Chip>
                  )}
                  <ChevronRight size={15} className="shrink-0 text-muted-2" />
                </Row>
              ))}
            </List>
          )}
        </>
      ) : history.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Todavía no jugaste ninguna"
          description="Cuando dispute tandas, vas a ver acá los resultados."
        />
      ) : (
        <List>
          {history.map((h) => (
            <Row key={h.id}>
              <span
                className={cn(
                  "w-5 text-center text-xs font-extrabold",
                  h.won ? "text-turf" : "text-danger"
                )}
              >
                {h.won ? "V" : "D"}
              </span>
              <ClubCrest club={h.rival_crest} size={24} showFallback={false} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {h.rival_name}
              </span>
              <span className="font-display text-sm font-bold tabular-nums">
                {h.my_score}–{h.rival_score}
              </span>
            </Row>
          ))}
        </List>
      )}
    </div>
  );
}
