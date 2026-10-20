/*  Mi Ruta — service worker
    ---------------------------------------------------------------
    Está por dos razones: para que el celular ofrezca INSTALAR la app
    y para que abra aunque el chofer esté sin señal.

    Controla SOLO ruta.html (se registra con scope './ruta.html'). El
    planificador vive en la misma carpeta y no pasa por aquí.

    LA PÁGINA VA SIEMPRE A LA RED PRIMERO: así cada versión nueva llega
    sola, igual que hoy. La copia guardada solo se usa sin señal.

    LO QUE SE GUARDA DE UNA VEZ: el manifiesto y los íconos (no cambian).

    LO QUE NUNCA SE GUARDA: las respuestas del Apps Script. Los estados
    y el orden cambian todo el día, y esas peticiones llevan la clave.
    Los cambios sin señal ya los guarda la propia app en el celular y
    los envía cuando vuelve la conexión.
*/

const VERSION = 'miruta-v1';
const PAGINA = './ruta.html';
const BASICOS = [
  PAGINA,
  './ruta.webmanifest',
  './ruta-icono-192.png',
  './ruta-icono-512.png',
  './ruta-icono-maskable-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(BASICOS))
      .catch(() => {})            // si falta un archivo la app igual funciona en línea
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ns => Promise.all(ns.filter(n => n.indexOf('miruta-') === 0 && n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nube (Apps Script) y cualquier otro sitio: no se tocan.
  if (url.origin !== self.location.origin) return;

  // La app: red primero; la copia (siempre bajo el mismo nombre, sin ?v=) solo sin señal.
  if (url.pathname.endsWith('/ruta.html') || req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok && url.pathname.endsWith('/ruta.html')) {
            const copia = res.clone();
            caches.open(VERSION).then(c => c.put(PAGINA, copia)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(PAGINA, { ignoreSearch: true }))
    );
    return;
  }

  // Manifiesto e íconos: de la caché si están.
  if (BASICOS.some(b => url.pathname.endsWith(b.slice(1)))) {
    ev.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
  }
});
