/* Motio push service worker.
 *
 * Deliberately minimal and dependency-free — it runs outside the app bundle.
 * It ONLY handles Web Push display and clicks; it intentionally has NO `fetch`
 * handler, so it never intercepts requests or caches responses and cannot
 * affect the SPA's loading behaviour. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = {};
  }

  const title = data.title || 'Motio';
  const options = {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || undefined,
    // Re-alert when a fresh notification reuses an existing tag.
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an already-open Motio tab if there is one, otherwise open a new one.
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && target && target !== '/') {
          try {
            await client.navigate(target);
          } catch (_e) {
            /* cross-origin or detached — ignore */
          }
        }
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});

// Take control immediately so pushes work right after opt-in, without a reload.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
