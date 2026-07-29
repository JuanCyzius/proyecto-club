// Service worker mínimo: cachea solo estáticos propios.
// NUNCA cachea peticiones a Supabase ni respuestas de la API: los datos
// del juego deben venir siempre del servidor.
const CACHE = "club-v1";
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;      // nada de terceros
  if (url.pathname.startsWith("/api")) return;          // nada de datos
  if (url.pathname.startsWith("/auth")) return;         // nada de sesión

  // Estáticos (escudos, iconos, build): cache primero, red de respaldo
  const isStatic =
    url.pathname.startsWith("/logos/") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest");

  if (!isStatic) return;

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});
