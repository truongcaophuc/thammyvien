// Base URL của CEP.
//
// Mặc định = "" (path tương đối) → mọi request đi qua Vite proxy (xem vite.config.ts)
// hoặc cùng origin với BE khi deploy production.
//
// Nếu cần trỏ thẳng tới CEP cross-origin (vd test với mobile device cùng LAN),
// set trong `telesales-app/.env.local`:
//   VITE_API_BASE_URL=https://192.168.1.10:7053
// LƯU Ý: cross-origin yêu cầu BE đổi cookie sang `SameSite=None; Secure`,
// nếu không browser sẽ KHÔNG gửi cookie XHR (xem schemeful-same-site).
export const API_BASE_URL: string =
  (import.meta as ImportMeta & { env?: Record<string, string> })?.env?.VITE_API_BASE_URL ?? "";
