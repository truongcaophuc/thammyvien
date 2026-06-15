import { useEffect, useState } from "react";
import { Bell, Calendar, UserPlus, CheckCircle2, Loader2 } from "lucide-react";
import Sheet from "../components/Sheet";
import {
  fetchMyNotifications,
  formatRelativeTime,
  getLastViewedAt,
  markNotificationsViewed,
  type NotificationType,
  type ServerNotification,
} from "../lib/notifications";

const iconOf: Record<string, React.ReactNode> = {
  lead_assigned: <UserPlus size={18} className="text-brand-600" />,
  appointment_reminder: <Calendar size={18} className="text-emerald-600" />,
  test: <CheckCircle2 size={18} className="text-sky-600" />,
};

const bgOf: Record<string, string> = {
  lead_assigned: "bg-brand-100",
  appointment_reminder: "bg-emerald-100",
  test: "bg-sky-100",
};

function iconFor(type: NotificationType) {
  return iconOf[type] ?? <Bell size={18} className="text-slate-500" />;
}

function bgFor(type: NotificationType) {
  return bgOf[type] ?? "bg-slate-100";
}

export default function NotificationSheet({ onClose }: { onClose: () => void }) {
  const [notifs, setNotifs] = useState<ServerNotification[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastViewed] = useState<Date | null>(() => getLastViewedAt());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const data = await fetchMyNotifications();
        if (cancelled) return;
        setNotifs(data);
        // Mark viewed sau khi load xong → unread badge ở Overview sẽ reset lần render sau
        markNotificationsViewed();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Không tải được thông báo");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Sheet title="Thông báo" onClose={onClose}>
      <div className="space-y-2 px-4">
        {notifs === null && !err && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {err && (
          <div className="rounded-2xl bg-rose-50 p-4 text-center text-[13px] text-rose-600 shadow-card">
            {err}
          </div>
        )}

        {notifs && notifs.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-[13px] text-slate-400 shadow-card">
            <Bell size={28} className="mx-auto mb-2 text-slate-300" />
            Chưa có thông báo nào
          </div>
        )}

        {notifs?.map((n) => {
          // Unread = sentAt > lastViewed (lưu trước khi markNotificationsViewed chạy)
          const isUnread = !lastViewed || new Date(n.sentAt) > lastViewed;
          return (
            <button
              key={n.id}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left shadow-card transition-colors ${
                isUnread ? "bg-brand-50/60" : "bg-white"
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bgFor(n.type)}`}>
                {iconFor(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-bold text-slate-800">{n.title}</span>
                  {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-600">{n.body}</div>
                <div className="mt-1 text-[11.5px] text-slate-400">{formatRelativeTime(n.sentAt)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
