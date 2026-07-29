"use client";

import { useState, useTransition } from "react";
import { MailCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import {
  register,
  signIn,
  resendConfirmation,
  requestPasswordReset,
} from "./actions";

type View = "auth" | "sent" | "forgot" | "forgotSent";

export function AuthForm() {
  const [view, setView] = useState<View>("auth");
  const [mode, setMode] = useState<"signin" | "register">("register");
  const [sentTo, setSentTo] = useState("");

  if (view === "sent") {
    return (
      <Confirmation
        email={sentTo}
        onBack={() => {
          setView("auth");
          setMode("signin");
        }}
      />
    );
  }

  if (view === "forgot") {
    return (
      <ForgotForm
        onSent={(email) => {
          setSentTo(email);
          setView("forgotSent");
        }}
        onBack={() => setView("auth")}
      />
    );
  }

  if (view === "forgotSent") {
    return (
      <Notice
        title="Revisá tu correo"
        text={`Enviamos un enlace a ${sentTo} para que crees una contraseña nueva.`}
        onBack={() => setView("auth")}
      />
    );
  }

  return (
    <div className="animate-fade-up">
      <p className="eyebrow mb-2">Tu club te espera</p>
      <h1 className="mb-6 text-3xl font-extrabold">
        {mode === "register" ? "Creá tu club" : "Entrá a tu club"}
      </h1>

      <div className="mb-5">
        <Tabs
          tabs={[
            { value: "register", label: "Crear cuenta" },
            { value: "signin", label: "Entrar" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "signin" | "register")}
        />
      </div>

      {mode === "register" ? (
        <RegisterForm
          onSent={(email) => {
            setSentTo(email);
            setView("sent");
          }}
        />
      ) : (
        <SignInForm onForgot={() => setView("forgot")} />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function RegisterForm({ onSent }: { onSent: (email: string) => void }) {
  const [clubName, setClubName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await register(clubName, username, email, password);
      if (!res.ok) setError(res.error);
      else if (res.needsConfirmation) onSent(email.trim().toLowerCase());
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nombre del club">
        <Input
          placeholder="Ej. Real Nocturno"
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          maxLength={24}
          required
        />
      </Field>
      <Field label="Usuario">
        <Input
          placeholder="ej. juanito_10"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
          }
          autoComplete="username"
          maxLength={20}
          required
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          inputMode="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Field label="Contraseña">
        <Input
          type="password"
          placeholder="mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </Field>
      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Creando…" : "Crear club"}
      </Button>
      <p className="text-center text-xs text-muted">
        Te enviaremos un email para confirmar tu cuenta.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn(email, password);
      if (res && !res.ok) setError(res.error ?? "Algo salió mal.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email">
        <Input
          type="email"
          inputMode="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Field label="Contraseña">
        <Input
          type="password"
          placeholder="tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <button
        type="button"
        onClick={onForgot}
        className="w-full py-1 text-sm text-muted hover:text-text"
      >
        Olvidé mi contraseña
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function Confirmation({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="animate-fade-up space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft text-turf">
        <MailCheck size={22} />
      </div>
      <div>
        <h1 className="text-2xl font-extrabold">Revisá tu correo</h1>
        <p className="mt-2 text-sm text-muted">
          Enviamos un enlace de confirmación a <b className="text-text">{email}</b>.
          Abrilo y entrás directo a tu club.
        </p>
        <p className="mt-2 text-xs text-muted">
          Si no aparece en unos minutos, mirá la carpeta de spam.
        </p>
      </div>
      <Button
        variant="secondary"
        fullWidth
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setMsg(null);
            const res = await resendConfirmation(email);
            if (res.ok) setMsg("Listo, te lo reenviamos.");
            else setError(res.error ?? "No se pudo reenviar.");
          })
        }
      >
        {pending ? "Enviando…" : "Reenviar email"}
      </Button>
      {msg && <p className="text-sm text-turf">{msg}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> Volver al acceso
      </button>
    </div>
  );
}

function ForgotForm({
  onSent,
  onBack,
}: {
  onSent: (email: string) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await requestPasswordReset(email);
          if (res.ok) onSent(email.trim().toLowerCase());
          else setError(res.error ?? "No se pudo enviar.");
        });
      }}
      className="animate-fade-up space-y-3"
    >
      <p className="eyebrow mb-2">Recuperar acceso</p>
      <h1 className="mb-1 text-2xl font-extrabold">Restablecer contraseña</h1>
      <p className="mb-4 text-sm text-muted">
        Te enviamos un enlace para crear una contraseña nueva.
      </p>
      <Input
        type="email"
        inputMode="email"
        placeholder="tu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-1 py-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> Volver
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function Notice({
  title,
  text,
  onBack,
}: {
  title: string;
  text: string;
  onBack: () => void;
}) {
  return (
    <div className="animate-fade-up space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft text-turf">
        <MailCheck size={22} />
      </div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> Volver al acceso
      </button>
    </div>
  );
}
