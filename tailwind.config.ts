import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Escala de superficie: del fondo del estadio a la línea de cal
        bg: "#080C10",
        surface: "#101820",
        "surface-2": "#16212A",
        "surface-3": "#1D2A35",
        border: "#22303B",
        "border-strong": "#2E3F4C",
        text: "#EAF1F3",
        muted: "#8FA3AD",
        "muted-2": "#63757E",
        // Acento: césped bajo focos
        turf: {
          DEFAULT: "#2FE08A",
          dim: "#25B36E",
          soft: "#15382A",
          ink: "#04160D",
        },
        // Premium / coleccionable
        trophy: {
          DEFAULT: "#F5C451",
          dim: "#C79B36",
          soft: "#332913",
        },
        danger: { DEFAULT: "#F2555A", soft: "#3A1517" },
        info: { DEFAULT: "#4FA8F5", soft: "#12283C" },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      // Escala de radios coherente
      borderRadius: {
        sm: "0.375rem",
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.75rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      // Profundidad: 3 niveles, sin sombras dramáticas
      boxShadow: {
        e1: "0 1px 2px rgba(0,0,0,0.35)",
        e2: "0 2px 8px -2px rgba(0,0,0,0.45), 0 1px 0 0 rgba(255,255,255,0.03) inset",
        e3: "0 12px 32px -12px rgba(0,0,0,0.6), 0 1px 0 0 rgba(255,255,255,0.04) inset",
        glow: "0 0 0 1px rgba(47,224,138,0.3), 0 6px 20px -6px rgba(47,224,138,0.4)",
        "glow-trophy":
          "0 0 0 1px rgba(245,196,81,0.3), 0 6px 20px -6px rgba(245,196,81,0.4)",
      },
      maxWidth: { app: "600px" },
      // Movimiento: rápido, elegante, nunca molesto
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: { 150: "150ms", 200: "200ms", 250: "250ms" },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translate3d(0,8px,0)" },
          to: { opacity: "1", transform: "translate3d(0,0,0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "sheet-up": {
          from: { transform: "translate3d(0,100%,0)" },
          to: { transform: "translate3d(0,0,0)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          from: { transform: "translate3d(-100%,0,0)" },
          to: { transform: "translate3d(100%,0,0)" },
        },
        "float-up": {
          from: { opacity: "1", transform: "translate3d(0,0,0)" },
          to: { opacity: "0", transform: "translate3d(0,-28px,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 250ms cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "scale-in": "scale-in 200ms cubic-bezier(0.16,1,0.3,1) both",
        "sheet-up": "sheet-up 280ms cubic-bezier(0.16,1,0.3,1) both",
        pop: "pop 320ms cubic-bezier(0.34,1.56,0.64,1)",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        "float-up": "float-up 900ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
