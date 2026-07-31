"use server";

import { createClient } from "@/lib/supabase/server";

export type ChatMsg = {
  id: number;
  body: string;
  created_at: string;
  club_name: string;
  mine: boolean;
};

export async function fetchChat(): Promise<ChatMsg[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("chat_fetch", { p_limit: 60 });
  if (error) return [];
  // Llega del más nuevo al más viejo: lo damos vuelta para pintar
  return ((data ?? []) as ChatMsg[]).reverse();
}

export async function sendChat(body: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("chat_send", { p_body: body });
  if (error) {
    const raw = error.message ?? "";
    if (raw.toLowerCase().includes("could not find"))
      return { ok: false, error: "Falta ejecutar la migración 0044_chat_global.sql." };
    return { ok: false, error: raw.replace(/^.*?:\s*/, "") || "No se pudo enviar." };
  }
  return { ok: true };
}

export async function markChatRead(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("chat_mark_read");
}
