import type { Attributes, GkAttributes, Position } from "../players";
import type { Tactics } from "../formations";

export type SimPlayer = {
  name: string;
  position: Position;   // posición natural de la carta
  slotPos: Position;    // posición donde juega en la formación
  attributes: Attributes;
  overall: number;
  /** Stats reales de portería (solo porteros). */
  gkAttributes?: GkAttributes | null;
  /** Id de la carta del usuario (para persistir el desgaste). */
  cardId?: string;
  /** Estamina con la que llega al partido (0-100). */
  startStamina?: number;
};

export type SimTeam = {
  name: string;
  starters: SimPlayer[]; // 11
  bench: SimPlayer[];
  tactics: Tactics;
  /** Química del once (0-100). Los rivales de la IA siempre son 100. */
  chemistry?: number;
  /** Media del once, para mostrarla antes del partido. */
  avgOverall?: number;
};

export type Side = "home" | "away";

export type MatchEventType =
  | "kickoff"
  | "chance"
  | "shot"
  | "goal"
  | "foul"
  | "yellow"
  | "red"
  | "injury"
  | "sub"
  | "halftime"
  | "fulltime"
  | "et_start"
  | "et_end"
  | "penalties"
  | "penalty"
  | "shootout_end";

export type MatchEvent = {
  minute: number;
  type: MatchEventType;
  side?: Side;
  text: string;
  player?: string;
  score?: [number, number];
};

export type TeamStats = {
  chances: number;
  shots: number;
  goals: number;
  fouls: number;
  yellow: number;
  red: number;
  possession: number; // %
};

export type PlayerRating = { name: string; rating: number; goals: number };

export type MatchResult = {
  homeScore: number;
  awayScore: number;
  winner: Side | "draw";
  wentToPenalties: boolean;
  penalties?: [number, number];
  events: MatchEvent[];
  stats: { home: TeamStats; away: TeamStats };
  ratings: { home: PlayerRating[]; away: PlayerRating[] };
  seed: string;
};

export type Competition = "friendly" | "league" | "cup" | "ranked";

export type SimInput = {
  home: SimTeam;
  away: SimTeam;
  seed: string;
  competition: Competition;
};

export type Units = {
  attack: number;
  midfield: number;
  defense: number;
  finishing: number;
  gk: number;
};
