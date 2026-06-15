// Minimal SW chỉ dùng cho notify-test.html — không precache, không push listener.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
