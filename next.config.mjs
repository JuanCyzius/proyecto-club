/** @type {import('next').NextConfig} */
const nextConfig = {
  // El typecheck SÍ corre en build (criterio de aceptación).
  eslint: { ignoreDuringBuilds: true },
  // Evita que Next descargue las fuentes de Google en tiempo de build.
  // Las fuentes se cargan en el navegador vía <link> en app/layout.tsx.
  optimizeFonts: false,
};
export default nextConfig;
