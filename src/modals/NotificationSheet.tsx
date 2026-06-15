import { Bell, BellRing, Calendar, UserPlus, CheckCircle2 } from "lucide-react";
import Sheet from "../components/Sheet";

// MOCK notification list — sẽ wire qua BE WebPushNotificationLog table sau:
//   SELECT Type, ReferenceId, SentAt FROM dbo."WebPushNotificationLog"
//   WHERE UserId = @uid ORDER BY SentAt DESC LIMIT 50;
type NotifType = "lead" | "appointment" | "info";

interface Notif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: string; // relative display
  read: boolean;
}

const mockNotifs: Notif[] = [
  {
    id: "n1",
    type: "lead",
    title: "Lead mới được phân bổ",
    body: "Nguyễn Thị Hồng Nhung — Telesales H1 2026",
    time: "2 phút trước",
    read: false,
  },
  {
    id: "n2",
    type: "appointment",
    title: "Lịch hẹn sắp tới",
    body: "Lúc 14:30 hôm nay — 5 Lý Tự Trọng P. Bến Nghé",
    time: "15 phút trước",
    read: false,
  },
  {
    id: "n3",
    type: "lead",
    title: "Lead mới được phân bổ",
    body: "Phùng Quốc Hưng — Page Hồng Ngọc",
    time: "1 giờ trước",
    read: true,
  },
  {
    id: "n4",
    type: "info",
    title: "Bạn vừa đạt mục tiêu hôm qua",
    body: "10 cuộc gọi + 2 lịch hẹn — vượt KPI 110%",
    time: "Hôm qua · 18:00",
    read: true,
  },
];

const iconOf: Record<NotifType, React.ReactNode> = {
  lead: <UserPlus size={18} className="text-brand-600" />,
  appointment: <Calendar size={18} className="text-emerald-600" />,
  info: <CheckCircle2 size={18} className="text-sky-600" />,
};

const bgOf: Record<NotifType, string> = {
  lead: "bg-brand-100",
  appointment: "bg-emerald-100",
  info: "bg-sky-100",
};

export default function NotificationSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Thông báo" onClose={onClose}>
      <div className="space-y-2 px-4">
        {mockNotifs.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-[13px] text-slate-400 shadow-card">
            <Bell size={28} className="mx-auto mb-2 text-slate-300" />
            Chưa có thông báo nào
          </div>
        )}
        {mockNotifs.map((n) => (
          <button
            key={n.id}
            className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left shadow-card transition-colors ${
              n.read ? "bg-white" : "bg-brand-50/60"
            }`}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bgOf[n.type]}`}>
              {iconOf[n.type]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-bold text-slate-800">{n.title}</span>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-slate-600">{n.body}</div>
              <div className="mt-1 text-[11.5px] text-slate-400">{n.time}</div>
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// Helper export — đếm unread cho badge ở bell icon
export function getUnreadCount(): number {
  return mockNotifs.filter((n) => !n.read).length;
}

// Re-export icon cho header dùng
export { BellRing };
