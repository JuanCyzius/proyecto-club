import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "trophy";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-turf text-turf-ink font-bold shadow-glow hover:bg-turf/90 active:bg-turf-dim",
  trophy:
    "bg-trophy text-bg font-bold shadow-glow-trophy hover:bg-trophy/90",
  secondary:
    "bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-surface-3",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger:
    "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-semibold",
        // Solo transform y color: nunca provoca reflow
        "transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
