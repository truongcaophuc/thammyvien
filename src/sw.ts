/// <reference lib="webworker" />
//
// Custom Service Worker cho Telesales PWA.
// - Pre-cache app shell (Workbox)
// - Cache font/image runtime
// - Handle push event → show notification
// - Handle notificationclick → focus tab cũ hoặc mở mới
//
// File này được dùng bởi vite-plugin-pwa với strategy `injectManifest`.
// Build time: __WB_MANIFEST sẽ được thay bằng danh sách asset pre-cache.

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>
}

// ===== Pre-cache app shell =====
precacheAndRoute(self.__WB_MANIFEST)

// ===== Runtime cache cho font/image =====
registerRoute(
  ({ url }) => /\.(woff2?|ttf|eot|png|jpg|jpeg|svg|webp)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
)

// ===== Push notification =====
// BE gửi JSON payload qua Web Push Protocol. SW nhận event push → show notification.
// Payload structure (xem WebPushService.cs):
//   { title, body, url, icon, tag }

interface PushPayload {
  title?: string
  body?: string
  url?: string
  icon?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  if (event.data) {
    try {
      data = event.data.json() as PushPayload
    } catch {
      data = { title: 'Telesales', body: event.data.text() }
    }
  }

  const title = data.title ?? 'Telesales'
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: data.icon ?? '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag,
    // Lưu URL vào data để notificationclick handler lấy ra
    data: { url: data.url ?? '/' },
    // requireInteraction: true để notification không tự biến mất (chỉ Android)
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Tìm tab đã mở của app — focus + nhắn navigate (handle trong App.tsx).
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus()
          client.postMessage({ type: 'navigate', url })
          return
        }
      }
      // Không có tab nào → mở mới
      await self.clients.openWindow(url)
    })()
  )
})

// Cho phép trang gọi skipWaiting để áp dụng SW mới ngay
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
