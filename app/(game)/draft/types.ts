import type { Attributes, GkAttributes, Position, Rarity } from "@/lib/players";

export type DraftCandidate = {
  template_id: string;
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  attributes: Attributes;
  gk_attributes: GkAttributes | null;
  club_name: string | null;
  league_name: string | null;
  nationality: string | null;
};

export type DraftPick = DraftCandidate & {
  slot: string;
  slot_pos: Position;
};

export type DraftState = {
  run_id: string;
  status: "drafting" | "playing" | "finished";
  formation: string;
  slot_index: number;
  total: number;
  position: Position | null;
  picks: DraftPick[];
  candidates: DraftCandidate[] | null;
  wins: number;
  losses: number;
};

export type PackCredit = { id: number; pack_code: string; pack_name: string };
