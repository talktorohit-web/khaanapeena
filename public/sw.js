// KhaanaPeena service worker — offline-first app shell.
// Billing must keep working when the restaurant's internet drops.
const CACHE = 'khaanapeena-v3'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return // let cross-origin (fonts/CDN) pass through
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      // network-first for page navigations so a new deploy shows up immediately;
      // cache-first for hashed assets (immutable filenames)
      if (req.mode === 'navigate') {
        try {
          const res = await fetch(req)
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        } catch {
          return cached || cache.match('./index.html')
        }
      }
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached || Response.error())
      return cached || network
    })
  )
})
