import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

// Usa la SECRET key (sb_secret_...) o, en su defecto, la service_role legacy.
// Estas claves NUNCA deben exponerse al cliente (no llevan NEXT_PUBLIC_).
export function createAdminClient() {
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en el entorno del servidor."
    );
  }
  return createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
