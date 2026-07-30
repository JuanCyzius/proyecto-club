"use client";

import { PeriodRanking } from "./period-ranking";
import type { RankRow, DailyWinner } from "./ranking-actions";

export function ActivityView({
  userId,
  ranking,
  dailyWinners,
}: {
  userId: string;
  ranking: RankRow[];
  dailyWinners: DailyWinner[];
}) {
  return (
    <div className="space-y-3">
      {dailyWinners.length > 0 && (
        <div className="space-y-1.5 rounded-2xl border border-trophy/35 bg-trophy-soft/15 p-3">
          <p className="text-xs font-bold text-trophy">
            Premio de ayer · los que más jugaron
          </p>
          {dailyWinners.map((w) => (
            <div key={w.rank} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-center font-display font-extrabold">
                {w.rank}º
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {w.club_name}
              </span>
              <span className="text-[11px] text-muted">{w.matches} partidos</span>
              <span className="font-bold text-trophy">+{w.coins}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted">
            Cada día: 700 / 500 / 400 monedas a los 3 clubes con más partidos.
          </p>
        </div>
      )}
      <PeriodRanking userId={userId} initial={ranking} />
    </div>
  );
}
