// Firma visual del juego: sección de campo con líneas tenues.
// Se coloca en position:absolute dentro de un contenedor relative.
export function PitchBackdrop({ className }: { className?: string }) {
  return <div className={`pitch-lines ${className ?? ""}`} aria-hidden />;
}
