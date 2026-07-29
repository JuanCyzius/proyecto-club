import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Procesa el enlace del email (confirmación de cuenta o reseteo de clave).
// Soporta los dos formatos que puede emitir Supabase:
//  - PKCE:      ?code=...
//  - Verify:    ?token_hash=...&type=signup|recovery|email
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/club";

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/auth/auth-error?reason=${encodeURIComponent(error.message)}`
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/auth/auth-error?reason=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}/auth/auth-error?reason=missing_code`);
}
