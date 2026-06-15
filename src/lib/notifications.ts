// Notification list fetch từ CEP — map từ dbo.WebPushNotificationLog đã enrich
// title/body theo type (lead_assigned / appointment_reminder / test).
import { gql } from "./graphql";

export type NotificationType = "lead_assigned" | "appointment_reminder" | "test" | string;

export interface ServerNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  sentAt: string; // ISO 8601
  referenceId: string | null;
}

interface MyNotificationsResponse {
  myNotifications: ServerNotification[];
}

const MY_NOTIFICATIONS_QUERY = `
  query MyNotifications {
    myNotifications {
      id
      type
      title
      body
      sentAt
      referenceId
    }
  }
`;

export async function fetchMyNotifications(): Promise<ServerNotification[]> {
  const data = await gql<MyNotificationsResponse>(MY_NOTIFICATIONS_QUERY);
  return data.myNotifications;
}

// ===== Read state — localStorage track lần cuối user mở sheet =====
const STORAGE_KEY = "telesales:notif:lastViewedAt";

/** Lưu timestamp lần cuối user mở notification sheet. */
export function markNotificationsViewed() {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    /* ignore — localStorage có thể disabled trong private mode */
  }
}

export function getLastViewedAt(): Date | null {
  try {
    const iso = localStorage.getItem(STORAGE_KEY);
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}

/** Đếm số notification mới hơn lastViewedAt. */
export function countUnread(notifs: ServerNotification[]): number {
  const last = getLastViewedAt();
  if (!last) return notifs.length; // chưa view lần nào → tất cả mới
  return notifs.filter((n) => new Date(n.sentAt) > last).length;
}

// ===== Display helpers =====

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const delta = (Date.now() - d.getTime()) / 1000;
  if (delta < 60) return "vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  if (delta < 172800) return "Hôm qua";
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}
