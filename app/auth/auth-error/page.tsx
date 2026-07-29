import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const reason = searchParams.reason ?? "";
  const expired =
    reason.toLowerCase().includes("expired") ||
    reason.toLowerCase().includes("invalid");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-app space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
          <AlertTriangle size={22} />
        </div>
        <h1 className="text-2xl font-extrabold">No pudimos confirmar el enlace</h1>
        <p className="text-sm text-muted">
          {expired
            ? "El enlace ya venció o fue usado. Pedí uno nuevo desde la pantalla de acceso."
            : "Hubo un problema al validar el enlace. Probá pedir uno nuevo."}
        </p>
        {reason && reason !== "missing_code" && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
            {reason}
          </p>
        )}
        <Link href="/login" className="block">
          <Button fullWidth>Volver al acceso</Button>
        </Link>
      </div>
    </main>
  );
}
