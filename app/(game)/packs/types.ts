import type { Attributes, GkAttributes, Position, Rarity } from "@/lib/players";

export type PulledItem = {
  kind: "item";
  code: string;
  name: string;
  description: string;
  item_kind: "heal" | "stamina";
  power: number;
  rarity: Rarity;
};

export type PulledPlayer = {
  kind?: "player";
  card_id: string;
  template_id: string;
  rarity: Rarity;
  overall: number;
  position: Position;
  attributes: Attributes;
  gk_attributes?: GkAttributes | null;
  club_name?: string | null;
  nationality?: string | null;
  name: string;
};

export type PulledCrest = {
  kind: "crest";
  club_name: string;
  logo_path: string;
};

export type PulledCard = PulledPlayer | PulledItem | PulledCrest;

export function isItem(c: PulledCard): c is PulledItem {
  return (c as PulledItem).kind === "item";
}

export function isCrest(c: PulledCard): c is PulledCrest {
  return (c as PulledCrest).kind === "crest";
}

