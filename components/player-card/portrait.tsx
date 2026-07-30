import { cn } from "@/lib/utils";
import { portraitFor } from "./avatar";

/**
 * Retrato del jugador. Reemplaza al avatar dibujado por código, pero
 * mantiene la misma idea: el rostro se deriva del nombre, así que un
 * jugador siempre se ve igual sin guardar nada en la base.
 *
 * Las imágenes vienen en lienzo cuadrado con la cabeza arriba y los
 * hombros abajo, así que `object-cover` centrado no deforma ni corta.
 */
export function Portrait({
  name,
  size,
  className,
  style,
  eager = false,
  rounded = true,
}: {
  name: string;
  /** Tamaño en px. Si se omite, ocupa el contenedor. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** true para la carta protagonista de una pantalla. */
  eager?: boolean;
  rounded?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={portraitFor(name)}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn(
        "shrink-0 select-none object-cover object-top",
        rounded && "rounded-full",
        className
      )}
      style={size ? { width: size, height: size, ...style } : style}
    />
  );
}
