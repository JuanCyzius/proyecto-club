// Preferimos la publishable key (sb_publishable_...), el reemplazo actual
// de la anon key para uso en cliente. Mantenemos fallback a anon por si el
// proyecto es antiguo. Ambas tienen el mismo privilegio bajo: RLS manda.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
