/* Build substitutes these literals; this worker caches only this application's static files. */
/* global __CACHE_NAME__, __BASE_PATH__, __CORE_FILES__ */
const CACHE = __CACHE_NAME__
const BASE = __BASE_PATH__
const CORE = __CORE_FILES__
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)))
})
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith('health-water-v3-'))
      // Keep the previous generation for still-open tabs requesting their hashed chunks.
      const previous = keys.filter((k) => k !== CACHE).at(-1)
      await Promise.all(keys.filter((k) => k !== CACHE && k !== previous).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(BASE) ||
    url.search
  )
    return
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) return response
        } catch {
          /* offline shell below */
        }
        return (await caches.open(CACHE)).match(BASE + 'index.html')
      })(),
    )
    return
  }
  if (
    !CORE.includes(url.pathname) &&
    !['assets/', 'models/', 'wasm/'].some((p) => url.pathname.startsWith(BASE + p))
  )
    return
  event.respondWith(
    (async () => {
      // Same-origin hashed assets have identical bytes irrespective of CORS Origin headers.
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request, { ignoreVary: true })
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
        return response
      } catch (error) {
        const keys = (await caches.keys()).filter((k) => k.startsWith('health-water-v3-'))
        for (const key of keys) {
          const older = await (await caches.open(key)).match(request, { ignoreVary: true })
          if (older) return older
        }
        throw error
      }
    })(),
  )
})
