/** Formato de moneda del juego: separadores locales, sin decimales. */
export function coins(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("es");
}

/** Abrevia números grandes: 12.400 → 12,4 mil. Para espacios estrechos. */
export function shortNum(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000)
    return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",")} mil`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
}

/** Apellido o última palabra, para espacios donde no entra el nombre. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

/** Tiempo restante legible: "3h 12m", "8 min", "cerrando". */
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "cerrando";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}
