import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-border bg-surface-2 px-3.5 text-[15px] text-text",
      "placeholder:text-muted-2",
      "transition-[border-color,box-shadow] duration-150 ease-out",
      "focus:border-turf focus:outline-none focus:ring-2 focus:ring-turf/25",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

/** Campo con etiqueta: un solo patrón para todos los formularios. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-2">{hint}</p>}
    </div>
  );
}

/** Selector nativo con el mismo aspecto que los inputs. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full appearance-none rounded-xl border border-border bg-surface-2 px-3.5 text-[14px] text-text",
      "bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9",
      "transition-colors duration-150 focus:border-turf focus:outline-none",
      className
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238FA3AD' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
