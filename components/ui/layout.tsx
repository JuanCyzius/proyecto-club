import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Cabecera de pantalla. Responde "¿dónde estoy?" en un vistazo y deja
 * un lugar fijo para la acción principal.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-[26px] font-extrabold leading-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-snug text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}

/** Bloque con etiqueta. Da ritmo vertical constante a todas las pantallas. */
export function Section({
  label,
  action,
  children,
  className,
}: {
  label?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {(label || action) && (
        <div className="flex items-center justify-between px-0.5">
          {label && <p className="eyebrow">{label}</p>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Dato destacado. Un número grande, una etiqueta chica. */
export function StatTile({
  icon: Icon,
  label,
  value,
  accent = "neutral",
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  accent?: "turf" | "trophy" | "danger" | "neutral";
  className?: string;
}) {
  const color =
    accent === "turf"
      ? "text-turf"
      : accent === "trophy"
        ? "text-trophy"
        : accent === "danger"
          ? "text-danger"
          : "text-text";
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-e1",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={13} className={color} />}
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      </div>
      <p
        className={cn(
          "mt-1 font-display text-xl font-extrabold leading-none tabular-nums",
          color
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Contenedor de lista. Agrupa filas con un solo borde exterior en vez
 * de una caja por elemento: menos ruido visual, más orden.
 */
export function List({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-e1",
        "[&>*]:border-b [&>*]:border-border/60 [&>*:last-child]:border-b-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Fila de lista, pulsable o estática. */
export function Row({
  children,
  onClick,
  className,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}) {
  const base = cn(
    "row w-full text-left",
    active && "bg-turf-soft/25",
    onClick && "tap hover:bg-surface-2",
    className
  );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
      </button>
    );
  return <div className={base}>{children}</div>;
}

/** Estado vacío: siempre una invitación a hacer algo, nunca un lamento. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center shadow-e1">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
        <Icon size={20} />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-[36ch] text-sm leading-snug text-muted">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

/** Aviso en línea. Un solo componente para error, éxito e información. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-danger/35 bg-danger-soft text-danger"
      : tone === "success"
        ? "border-turf/35 bg-turf-soft text-turf"
        : "border-border bg-surface-2 text-muted";
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "animate-fade-up rounded-xl border px-3.5 py-2.5 text-sm",
        styles
      )}
    >
      {children}
    </div>
  );
}

/** Etiqueta compacta para metadatos. */
export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "turf" | "trophy" | "danger" | "neutral";
  className?: string;
}) {
  const styles =
    tone === "turf"
      ? "bg-turf-soft text-turf"
      : tone === "trophy"
        ? "bg-trophy-soft text-trophy"
        : tone === "danger"
          ? "bg-danger-soft text-danger"
          : "bg-surface-2 text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
        styles,
        className
      )}
    >
      {children}
    </span>
  );
}

/** Barra de progreso. Anima con transform para no provocar reflow. */
export function Progress({
  value,
  max = 100,
  tone = "turf",
  className,
}: {
  value: number;
  max?: number;
  tone?: "turf" | "trophy" | "danger";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    tone === "turf" ? "bg-turf" : tone === "trophy" ? "bg-trophy" : "bg-danger";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-2",
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full origin-left rounded-full", color)}
        style={{
          transform: `scaleX(${pct / 100})`,
          transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </div>
  );
}

/** Bloque de carga. Reserva el espacio exacto y evita saltos de interfaz. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}
