// ============================================================
// AVATAR DE JUGADOR — generado por código, determinista.
//
// El mismo nombre produce siempre el mismo rostro. No se usan
// fotos ni retratos de personas reales: es una ilustración
// estilizada (silueta + rasgos simples) construida con SVG.
// ============================================================

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── RETRATOS ─────────────────────────────────────────────────────────
// 60 ilustraciones en /public/portraits. Se asigna una a cada jugador
// según su nombre: el mismo jugador tiene siempre el mismo rostro, sin
// necesidad de guardar nada en la base.
export const PORTRAIT_COUNT = 60;

export function portraitFor(name: string): string {
  const i = hash(name) % PORTRAIT_COUNT;
  return `/portraits/p${String(i).padStart(2, "0")}.webp`;
}

/** Generador determinista a partir de la semilla. */
function picker(seed: number) {
  let a = seed >>> 0;
  return function next(max: number): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % max;
  };
}

const SKIN = ["#F3D2B3", "#E8BE9A", "#D6A17C", "#B87D55", "#8D5A3B", "#5E3A26"];
const HAIR = ["#1B1410", "#2E2018", "#4A3020", "#6B4423", "#93642F", "#C8A45C", "#8A8A8A"];

export type AvatarStyle = {
  skin: string;
  hair: string;
  hairStyle: number; // 0-5
  beard: number; // 0 = sin barba
  brow: number;
  eye: number;
};

export function avatarStyle(name: string): AvatarStyle {
  const p = picker(hash(name));
  return {
    skin: SKIN[p(SKIN.length)],
    hair: HAIR[p(HAIR.length)],
    hairStyle: p(6),
    beard: p(4), // 0..3, 0 = sin barba
    brow: p(3),
    eye: p(3),
  };
}

// Los rostros son deterministas: el mismo nombre y tamaño producen
// siempre el mismo SVG, así que se cachean en memoria.
const faceCache = new Map<string, string>();
const FACE_CACHE_MAX = 600;

/**
 * Devuelve los elementos SVG del rostro, para insertar dentro de un
 * <svg> existente. `cx`, `cy` es el centro de la cabeza y `r` su radio.
 */
export function faceElements(
  name: string,
  cx: number,
  cy: number,
  r: number
): string {
  const key = `${name}|${cx}|${cy}|${r}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const svg = buildFace(name, cx, cy, r);
  if (faceCache.size > FACE_CACHE_MAX) faceCache.clear();
  faceCache.set(key, svg);
  return svg;
}

function buildFace(
  name: string,
  cx: number,
  cy: number,
  r: number
): string {
  const s = avatarStyle(name);
  const id = hash(name).toString(36);

  const eyeY = cy - r * 0.05;
  const eyeDx = r * 0.36;
  const eyeR = r * 0.09;

  // Pelo según el estilo
  let hair = "";
  switch (s.hairStyle) {
    case 0: // corto clásico
      hair = `<path d="M ${cx - r} ${cy - r * 0.15} a ${r} ${r} 0 0 1 ${r * 2} 0 q -${r} -${r * 0.75} -${r * 2} 0 z" fill="${s.hair}"/>`;
      break;
    case 1: // con volumen
      hair = `<path d="M ${cx - r * 1.02} ${cy - r * 0.1} a ${r * 1.02} ${r * 1.1} 0 0 1 ${r * 2.04} 0 q -${r * 0.5} -${r * 1.1} -${r * 2.04} 0 z" fill="${s.hair}"/>`;
      break;
    case 2: // rapado
      hair = `<path d="M ${cx - r * 0.95} ${cy - r * 0.32} a ${r * 0.95} ${r * 0.9} 0 0 1 ${r * 1.9} 0 q -${r * 0.95} -${r * 0.5} -${r * 1.9} 0 z" fill="${s.hair}" opacity="0.85"/>`;
      break;
    case 3: // con raya
      hair = `<path d="M ${cx - r} ${cy - r * 0.18} a ${r} ${r} 0 0 1 ${r * 2} 0 q -${r * 0.3} -${r * 0.6} -${r * 0.9} -${r * 0.55} q -${r * 0.5} ${r * 0.15} -${r * 1.1} ${r * 0.55} z" fill="${s.hair}"/>`;
      break;
    case 4: // rizado
      hair = `<g fill="${s.hair}">
        <circle cx="${cx - r * 0.6}" cy="${cy - r * 0.55}" r="${r * 0.32}"/>
        <circle cx="${cx}" cy="${cy - r * 0.75}" r="${r * 0.36}"/>
        <circle cx="${cx + r * 0.6}" cy="${cy - r * 0.55}" r="${r * 0.32}"/>
        <circle cx="${cx - r * 0.9}" cy="${cy - r * 0.2}" r="${r * 0.26}"/>
        <circle cx="${cx + r * 0.9}" cy="${cy - r * 0.2}" r="${r * 0.26}"/>
      </g>`;
      break;
    default: // recogido
      hair = `<path d="M ${cx - r} ${cy - r * 0.12} a ${r} ${r} 0 0 1 ${r * 2} 0 q -${r} -${r * 0.8} -${r * 2} 0 z" fill="${s.hair}"/>
        <circle cx="${cx}" cy="${cy - r * 1.05}" r="${r * 0.22}" fill="${s.hair}"/>`;
  }

  // Barba
  let beard = "";
  if (s.beard === 1) {
    beard = `<path d="M ${cx - r * 0.72} ${cy + r * 0.18} q ${r * 0.72} ${r * 1.05} ${r * 1.44} 0 q -${r * 0.2} ${r * 0.62} -${r * 0.72} ${r * 0.62} q -${r * 0.52} 0 -${r * 0.72} -${r * 0.62} z" fill="${s.hair}" opacity="0.9"/>`;
  } else if (s.beard === 2) {
    // perilla
    beard = `<ellipse cx="${cx}" cy="${cy + r * 0.6}" rx="${r * 0.26}" ry="${r * 0.2}" fill="${s.hair}" opacity="0.9"/>`;
  } else if (s.beard === 3) {
    // bigote
    beard = `<rect x="${cx - r * 0.24}" y="${cy + r * 0.28}" width="${r * 0.48}" height="${r * 0.1}" rx="${r * 0.05}" fill="${s.hair}" opacity="0.9"/>`;
  }

  const browY = eyeY - r * 0.24;
  const browW = r * 0.26;
  const browTilt = s.brow === 0 ? 0 : s.brow === 1 ? -r * 0.06 : r * 0.05;

  return `
  <defs>
    <clipPath id="head-${id}">
      <circle cx="${cx}" cy="${cy}" r="${r}"/>
    </clipPath>
  </defs>
  <g>
    <!-- cuello -->
    <rect x="${cx - r * 0.32}" y="${cy + r * 0.62}" width="${r * 0.64}" height="${r * 0.6}" fill="${s.skin}"/>
    <!-- orejas -->
    <circle cx="${cx - r * 0.98}" cy="${cy + r * 0.08}" r="${r * 0.16}" fill="${s.skin}"/>
    <circle cx="${cx + r * 0.98}" cy="${cy + r * 0.08}" r="${r * 0.16}" fill="${s.skin}"/>
    <!-- cabeza -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.skin}"/>
    <g clip-path="url(#head-${id})">
      ${hair}
      ${beard}
    </g>
    <!-- cejas -->
    <rect x="${cx - eyeDx - browW / 2}" y="${browY + browTilt}" width="${browW}" height="${r * 0.07}" rx="${r * 0.035}" fill="${s.hair}"/>
    <rect x="${cx + eyeDx - browW / 2}" y="${browY + browTilt}" width="${browW}" height="${r * 0.07}" rx="${r * 0.035}" fill="${s.hair}"/>
    <!-- ojos -->
    <ellipse cx="${cx - eyeDx}" cy="${eyeY}" rx="${eyeR * 1.15}" ry="${eyeR}" fill="#FFFFFF"/>
    <ellipse cx="${cx + eyeDx}" cy="${eyeY}" rx="${eyeR * 1.15}" ry="${eyeR}" fill="#FFFFFF"/>
    <circle cx="${cx - eyeDx}" cy="${eyeY}" r="${eyeR * 0.6}" fill="#2A1D14"/>
    <circle cx="${cx + eyeDx}" cy="${eyeY}" r="${eyeR * 0.6}" fill="#2A1D14"/>
    <!-- nariz -->
    <path d="M ${cx} ${cy + r * 0.02} q ${r * 0.1} ${r * 0.2} -${r * 0.04} ${r * 0.22}" stroke="rgba(0,0,0,0.22)" stroke-width="${r * 0.05}" fill="none" stroke-linecap="round"/>
    <!-- boca -->
    <path d="M ${cx - r * 0.2} ${cy + r * 0.42} q ${r * 0.2} ${r * 0.14} ${r * 0.4} 0" stroke="rgba(0,0,0,0.35)" stroke-width="${r * 0.055}" fill="none" stroke-linecap="round"/>
  </g>`;
}

/** Avatar independiente (para listas y fichas). */
export function PlayerAvatar({
  name,
  size = 48,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const r = 34;
  const cx = 50;
  const cy = 46;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Avatar de ${name}`}
      dangerouslySetInnerHTML={{ __html: faceElements(name, cx, cy, r) }}
    />
  );
}
