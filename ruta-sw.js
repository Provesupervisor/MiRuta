/*  Mi Ruta — service worker
    ---------------------------------------------------------------
    Está por dos razones: para que el celular ofrezca INSTALAR la app
    y para que abra aunque el chofer esté sin señal.

    Mi Ruta vive en su propio repositorio (provesupervisor.github.io/MiRuta/),
    con la app en index.html, así que controla toda esa carpeta. El
    planificador está en otro repositorio y no pasa por aquí.

    LA PÁGINA VA SIEMPRE A LA RED PRIMERO: así cada versión nueva llega
    sola, igual que hoy. La copia guardada solo se usa sin señal.

    LO QUE SE GUARDA DE UNA VEZ: el manifiesto y los íconos (no cambian).

    LO QUE NUNCA SE GUARDA: las respuestas del Apps Script. Los estados
    y el orden cambian todo el día, y esas peticiones llevan la clave.
    Los cambios sin señal ya los guarda la propia app en el celular y
    los envía cuando vuelve la conexión.
*/

const VERSION = 'miruta-v6';
const RED_ESPERA = 4000;          // ms: más que esto con la red colgada, se abre la copia guardada
function conLimite(p, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('la red no respondió')), ms);
    p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); mal(e); });
  });
}
const PAGINA = './';
const BASICOS = [
  PAGINA,
  './index.html',
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

  // La app: red primero, PERO con límite de espera (v3). Con señal débil la red no
  // falla: se queda colgada, y el celular mostraba el logo de inicio sin abrir
  // nunca. Si la red no responde en RED_ESPERA, se abre la copia guardada y la
  // versión nueva se sigue bajando por detrás (queda lista para la próxima vez).
  const esApp = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (esApp) {
    const red = fetch(req).then(res => {
      if (res.ok) {
        const copia = res.clone();
        caches.open(VERSION).then(c => c.put(PAGINA, copia)).catch(() => {});
      }
      return res;
    });
    ev.waitUntil(red.then(() => {}, () => {}));
    ev.respondWith((async () => {
      try {
        return await conLimite(red, RED_ESPERA);
      } catch (e) {
        const guardada = await caches.match(PAGINA, { ignoreSearch: true });
        if (guardada) return guardada;
        return red;                 // primera vez en este celular: no hay copia, se espera a la red
      }
    })());
    return;
  }

  // Manifiesto e íconos: de la caché si están.
  if (BASICOS.some(b => b.length > 2 && url.pathname.endsWith(b.slice(1)))) {
    ev.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
  }
});
