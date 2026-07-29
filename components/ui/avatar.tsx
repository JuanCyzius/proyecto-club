import { cn } from "@/lib/utils";

export function Avatar({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const initials = label
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-xl border border-turf/30 bg-turf-soft font-display text-lg font-bold text-turf",
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
