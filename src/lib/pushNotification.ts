// Web Push Standard helper — subscribe/unsubscribe + state checks.
//
// Yêu cầu:
//  - Browser hỗ trợ ServiceWorker + PushManager + Notification
//  - HTTPS (hoặc localhost) — không có HTTPS thì PushManager không khả dụng
//  - User đã accept Notification permission (prompted on subscribe())
//
// BE expose:
//  - GET  /api/push/vapid-public-key
//  - POST /api/push/subscribe   { endpoint, p256dh, auth, userAgent }
//  - POST /api/push/unsubscribe { endpoint }
import { api } from "./api";

export type PushPermission = "default" | "granted" | "denied";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermission(): PushPermission {
  if (!isPushSupported()) return "denied";
  return Notification.permission as PushPermission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // vite-plugin-pwa register SW tự động — chỉ cần ready
  return navigator.serviceWorker.ready;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// URL-base64 (RFC 7515) → Uint8Array — định dạng applicationServerKey browser yêu cầu.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "Trình duyệt không hỗ trợ push notification" };
  }

  // Step 1: xin permission. Nếu user đã denied lần trước, không thể bật lại từ JS.
  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    return { ok: false, reason: "Bạn cần cấp quyền thông báo trong cài đặt trình duyệt" };
  }

  // Step 2: lấy VAPID public key từ BE.
  let vapidPublicKey: string;
  try {
    const res = await api<{ publicKey: string }>("/api/push/vapid-public-key", { method: "GET" });
    vapidPublicKey = res.publicKey;
    if (!vapidPublicKey) {
      return { ok: false, reason: "Server chưa cấu hình VAPID key" };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Không lấy được VAPID key" };
  }

  // Step 3: subscribe qua PushManager — browser tự gọi FCM/APNS để tạo endpoint.
  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "Service worker chưa sẵn sàng" };

  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // bắt buộc — mỗi push phải show notification
      // Cast BufferSource: TS 5.7+ thắt Uint8Array<ArrayBufferLike> không match
      // applicationServerKey signature trực tiếp.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Subscribe thất bại" };
  }

  // Step 4: gửi subscription lên BE để lưu (CEP sẽ dùng nó để gửi push).
  const json = sub.toJSON();
  try {
    await api("/api/push/subscribe", {
      method: "POST",
      body: {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? arrayBufferToBase64Url(sub.getKey("p256dh")),
        auth: json.keys?.auth ?? arrayBufferToBase64Url(sub.getKey("auth")),
        userAgent: navigator.userAgent,
      },
    });
  } catch (e) {
    // Rollback subscription nếu BE fail — tránh state inconsistent
    try { await sub.unsubscribe(); } catch { /* noop */ }
    return { ok: false, reason: e instanceof Error ? e.message : "Lưu subscription thất bại" };
  }

  return { ok: true };
}

export async function unsubscribePush(): Promise<{ ok: boolean; reason?: string }> {
  const sub = await getCurrentSubscription();
  if (!sub) return { ok: true };

  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // ignore — vẫn báo BE để xóa
  }
  try {
    await api("/api/push/unsubscribe", { method: "POST", body: { endpoint } });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Gỡ subscription trên server thất bại" };
  }
  return { ok: true };
}

// Gọi test endpoint — BE sẽ gửi 1 push về cho mọi subscription của user hiện tại.
export async function sendTestPush(): Promise<{ ok: boolean; sent?: number; reason?: string }> {
  try {
    const r = await api<{ sent: number }>("/api/push/test", { method: "POST" });
    return { ok: true, sent: r.sent };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Gửi test push thất bại" };
  }
}
