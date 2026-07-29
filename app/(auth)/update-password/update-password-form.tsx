"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePassword } from "../login/actions";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    startTransition(async () => {
      const res = await updatePassword(password);
      if (res && !res.ok) setError(res.error ?? "No se pudo actualizar.");
    });
  }

  return (
    <form onSubmit={submit} className="animate-fade-up space-y-3">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft text-turf">
        <KeyRound size={22} />
      </div>
      <h1 className="text-2xl font-extrabold">Nueva contraseña</h1>
      <p className="pb-2 text-sm text-muted">
        Elegí una contraseña nueva para entrar a tu club.
      </p>
      <Input
        type="password"
        placeholder="mínimo 6 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Input
        type="password"
        placeholder="repetí la contraseña"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Guardando…" : "Guardar y entrar"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
