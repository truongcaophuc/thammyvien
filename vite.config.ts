import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Proxy `/api` và `/graphql` qua Vite dev server → trỏ vào CEP.
// Lý do: cookie HttpOnly với SameSite=Lax không attach cho cross-site XHR
// (Chrome schemeful-same-site coi http://localhost:5173 vs https://localhost:7053 là cross-site).
// Proxy biến browser thành chỉ thấy 1 origin duy nhất (localhost:5173) → cookie attach bình thường.
//
// QUAN TRỌNG: CEP set cookie với `Secure=true` vì `Request.IsHttps=true` (Vite → CEP qua HTTPS).
// Nhưng FE chạy HTTP → browser sẽ drop cookie có flag Secure → cookie không bao giờ lưu được.
// → Vite proxy rewrite Set-Cookie response để strip `Secure` cho dev. KHÔNG ảnh hưởng production
// vì FE+CEP cùng origin HTTPS → cookie Secure work bình thường.
//
// Khi build production: FE deploy cùng origin với CEP (cùng nginx) → proxy không cần,
// path tương đối `/api/*`, `/graphql` vẫn work nguyên.
const CEP_BACKEND = process.env.VITE_CEP_BACKEND ?? 'https://localhost:7053'

function stripSecureCookie(setCookie: string | string[] | undefined): string[] | undefined {
  if (!setCookie) return undefined
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie]
  return arr.map((c) => c.replace(/;\s*Secure/gi, ''))
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Tự update Service Worker khi build mới — không cần user reload thủ công
      registerType: 'autoUpdate',
      // Inject vào index.html: <link rel="manifest"> + <script> register SW
      injectRegister: 'auto',
      // injectManifest: dùng file SW tự viết (src/sw.ts) để custom push event handler.
      // generateSW (mặc định) không support custom code — chỉ workbox config.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Bật trong dev để test trên phone (production luôn bật)
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Telesales Studio',
        short_name: 'Telesales',
        description: 'Ứng dụng telesales — quản lý lead, gọi điện, đặt lịch hẹn',
        theme_color: '#7c3aed',
        background_color: '#7c3aed',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'vi',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // injectManifest config — pre-cache shell. Runtime caching được handle trong src/sw.ts.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  server: {
    // host: '0.0.0.0' để mọi NIC bind (LAN, WiFi) — cho phép truy cập từ điện thoại
    // cùng mạng WiFi. Khi truy cập từ PC dùng `http://127.0.0.1:5173` (tránh share
    // cookie với CEP localhost:7053). Khi từ phone dùng `http://<LAN_IP>:5173`.
    host: '0.0.0.0',
    // Vite chặn host header không khớp mặc định → cho phép any host LAN truy cập
    allowedHosts: true,
    proxy: {
      '/api': {
        target: CEP_BACKEND,
        changeOrigin: true,
        secure: false, // chấp nhận cert self-signed của CEP (dev)
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const stripped = stripSecureCookie(proxyRes.headers['set-cookie'])
            if (stripped) proxyRes.headers['set-cookie'] = stripped
          })
        },
      },
      '/graphql': {
        target: CEP_BACKEND,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const stripped = stripSecureCookie(proxyRes.headers['set-cookie'])
            if (stripped) proxyRes.headers['set-cookie'] = stripped
          })
        },
      },
    },
  },
})
