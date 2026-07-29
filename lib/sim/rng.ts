// RNG determinista y SERIALIZABLE (xfnv1a + mulberry32).
// El estado es un solo entero, así se puede guardar en la base de datos
// entre tramos del partido y continuar exactamente donde quedó.

export function seedToState(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  next: () => number;
  /** Estado actual, para guardar y reanudar. */
  state: () => number;
};

export function makeRngFromState(initial: number): Rng {
  let a = initial >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return a >>> 0;
    },
  };
}

/** Compatibilidad con el motor instantáneo. */
export function makeRng(seedStr: string): () => number {
  return makeRngFromState(seedToState(seedStr)).next;
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
