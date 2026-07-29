"use client";

import { useState, useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeSetup, abandonSession } from "./actions";

export function SetupForm({
  suggestedUsername,
}: {
  suggestedUsername: string;
}) {
  const clean = suggestedUsername.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const [clubName, setClubName] = useState("");
  const [username, setUsername] = useState(clean.slice(0, 20));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await completeSetup(clubName, username);
      if (res && !res.ok) setError(res.error ?? "No se pudo crear el club.");
    });
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-trophy/30 bg-trophy-soft text-trophy">
        <ShieldAlert size={22} />
      </div>
      <h1 className="mb-1 text-2xl font-extrabold">Falta crear tu club</h1>
      <p className="mb-6 text-sm text-muted">
        Tu cuenta existe pero el club no llegó a crearse. Completá estos datos y
        seguimos.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">
            Nombre del club
          </label>
          <Input
            placeholder="Ej. Real Nocturno"
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            maxLength={24}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">
            Usuario
          </label>
          <Input
            placeholder="ej. juanito_10"
            value={username}
            onChange={(e) =>
              setUsername(
                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
              )
            }
            maxLength={20}
            required
          />
        </div>
        <Button type="submit" size="lg" fullWidth disabled={pending}>
          {pending ? "Creando…" : "Crear club y entrar"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>

      <form action={abandonSession} className="mt-4">
        <button
          type="submit"
          className="w-full py-2 text-sm text-muted hover:text-text"
        >
          Cerrar sesión y volver al inicio
        </button>
      </form>
    </div>
  );
}
