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

// SW mới lên quyền NGAY, không nằm chờ tới khi đóng hết tab. Thiếu 2 dòng này thì
// bản deploy mới bị kẹt ở trạng thái waiting, tab cũ vẫn được phục vụ index.html cũ
// -> user phải hard refresh mới thấy code mới.
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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

  // Chỉ show notification. Live-update trong-app do GraphQL subscription (WebSocket) lo,
  // không dùng postMessage nữa.
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

// ===== Self-heal: push service (FCM/Apple) xoay/vô hiệu endpoint → tự đăng ký lại =====
// Chạy cả khi app ĐÓNG. Auth qua cookie same-origin nên fetch kèm credentials.
function b64ToUint8(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
function bufToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

self.addEventListener('pushsubscriptionchange', ((event: ExtendableEvent) => {
  const ev = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null
    newSubscription?: PushSubscription | null
  }
  ev.waitUntil(
    (async () => {
      const oldEndpoint = ev.oldSubscription?.endpoint
      try {
        let newSub = ev.newSubscription ?? null
        if (!newSub) {
          // VAPID public key: ưu tiên từ sub cũ, fallback fetch server
          let appKey: BufferSource | null | undefined =
            ev.oldSubscription?.options?.applicationServerKey
          if (!appKey) {
            const r = await fetch('/api/push/vapid-public-key', { credentials: 'include' })
            const j = (await r.json()) as { publicKey: string }
            appKey = b64ToUint8(j.publicKey) as BufferSource
          }
          if (!appKey) return
          newSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appKey,
          })
        }
        if (!newSub) return
        const json = newSub.toJSON()
        // Lưu endpoint MỚI
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            p256dh: json.keys?.p256dh ?? bufToB64Url(newSub.getKey('p256dh')),
            auth: json.keys?.auth ?? bufToB64Url(newSub.getKey('auth')),
            userAgent: navigator.userAgent,
          }),
        })
        // Dọn endpoint CŨ (đã chết) khỏi server
        if (oldEndpoint && oldEndpoint !== newSub.endpoint) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: oldEndpoint }),
          })
        }
      } catch {
        // best-effort — app sẽ re-sync khi mở lần sau
      }
    })(),
  )
}) as EventListener)
