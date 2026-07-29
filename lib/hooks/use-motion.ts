"use client";

import { useEffect, useRef, useState } from "react";

/** Respeta la preferencia del sistema de reducir movimiento. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Cuenta desde el valor anterior hasta el nuevo. Los números nunca
 * cambian de golpe: suben, y eso hace que ganar se sienta como ganar.
 */
export function useCountUp(value: number, duration = 700): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (reduced || value === fromRef.current) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo: rápido al principio, se asienta suave
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration, reduced]);

  return display;
}

/** Dispara una animación breve cada vez que cambia el valor. */
export function usePulse(value: unknown): boolean {
  const [pulsing, setPulsing] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 340);
    return () => clearTimeout(t);
  }, [value]);
  return pulsing;
}
