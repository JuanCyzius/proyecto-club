"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * En móvil se comporta como una hoja que sube desde abajo (el pulgar
 * llega a los controles); en pantallas grandes, como diálogo centrado.
 * Bloquea el scroll de fondo y cierra con Escape o tocando fuera.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Evita que el fondo haga scroll detrás de la hoja
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[85dvh] w-full max-w-app flex-col rounded-t-3xl border border-border",
          "bg-surface shadow-e3 outline-none sm:rounded-3xl",
          "animate-sheet-up sm:animate-scale-in gpu",
          className
        )}
      >
        {/* Asa: indica que se puede arrastrar/cerrar */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-border-strong" />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <h2 className="truncate text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {children}
        </div>

        {footer && (
          <div className="border-t border-border px-4 py-3 pb-safe">{footer}</div>
        )}
      </div>
    </div>
  );
}
