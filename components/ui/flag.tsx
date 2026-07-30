import { cn } from "@/lib/utils";
import { flagSrc } from "@/lib/flags";

/**
 * Bandera de nacionalidad. Los SVG son cuadrados (1:1), así que basta
 * con fijar el tamaño: nunca se deforman.
 *
 * Si el país no se reconoce, cae en un marcador neutro en vez de
 * romper el render.
 */
export function Flag({
  nation,
  size = 16,
  className,
  style,
}: {
  nation?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const src = flagSrc(nation);

  if (!src) {
    return (
      <span
        className={cn(
          "inline-block shrink-0 rounded-full bg-surface-2 ring-1 ring-border",
          className
        )}
        style={{ width: size, height: size, ...style }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={nation ?? ""}
      title={nation ?? undefined}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("inline-block shrink-0 rounded-full object-cover", className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}
