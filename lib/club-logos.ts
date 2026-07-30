import CLUB_LOGOS from "./club-logos.json";

const LOGOS = CLUB_LOGOS as Record<string, string>;

/**
 * Ruta del escudo de un club, o null si no lo tenemos.
 *
 * Vive en `lib/` y no dentro del componente a propósito: es una función
 * pura, y así puede llamarse tanto desde el servidor como desde el
 * navegador. Si estuviera en un archivo "use client", al invocarla desde
 * un componente de servidor no sería una función real y fallaría.
 */
export function clubLogo(clubName?: string | null): string | null {
  if (!clubName) return null;
  return LOGOS[clubName.trim()] ?? null;
}

export function hasClubLogo(clubName?: string | null): boolean {
  return clubLogo(clubName) !== null;
}
