import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, CalendarPlus, CalendarCheck, CalendarRange, ChevronRight, RotateCw, Bell } from "lucide-react";
import { fetchCskhOverview, fetchCarePatients, fetchCskhNotifications, type CskhOverview } from "../../lib/cskh";
import type { Patient } from "../../lib/dtv";
import { countUnread } from "../../lib/notifications";
import NotificationSheet from "../../modals/NotificationSheet";

// Avatar: 2 chữ cái + màu hash cố định (đồng bộ danh sách khách).
function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/).filter((w) => w && !/^\d/.test(w));
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
const AVA_COLORS = ["#7c3aed", "#6366f1", "#0ea5e9", "#10b981", "#14b8a6", "#f59e0b", "#fb923c", "#ec4899", "#8b5cf6", "#ef4444"];
function colorOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVA_COLORS[h % AVA_COLORS.length];
}

// Tổng quan CSKH — chỉ số đặt lịch + danh sách khách (bấm để đặt buổi).
export default function CskhOverviewScreen({
  onGoBooking,
  onOpenPatient,
}: {
  onGoBooking: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [data, setData] = useState<CskhOverview | null>(null);
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [err, setErr] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    setErr(false);
    setData(null);
    setPatients(null);
    fetchCskhOverview().then(setData).catch(() => setErr(true));
    fetchCarePatients().then(setPatients).catch(() => setPatients([]));
    fetchCskhNotifications().then((n) => setUnread(countUnread(n))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Refetch TẠI CHỖ (không spinner) cả chỉ số + danh sách + badge khi push đến / app hiện lại.
  const refresh = useCallback(() => {
    fetchCskhOverview().then(setData).catch(() => {});
    fetchCarePatients().then(setPatients).catch(() => {});
    fetchCskhNotifications().then((n) => setUnread(countUnread(n))).catch(() => {});
  }, []);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("sw-push", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("sw-push", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  if (err) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-[#eef0f5] px-8 text-center">
        <div className="text-[14px] font-semibold text-slate-600">Không tải được tổng quan</div>
        <div className="text-[12.5px] text-slate-400">Kiểm tra kết nối rồi thử lại.</div>
        <button onClick={load} className="mt-1 flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700">
          <RotateCw size={15} /> Thử lại
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#eef0f5] text-slate-400">
        <Loader2 size={26} className="animate-spin" />
      </div>
    );
  }

  const stats = [
    { label: "Đang điều trị", value: data.activeCount, Icon: Users, tint: "bg-brand-50 text-brand-600" },
    { label: "Cần đặt buổi", value: data.needBookCount, Icon: CalendarPlus, tint: "bg-amber-50 text-amber-600" },
    { label: "Lịch hôm nay", value: data.todayCount, Icon: CalendarCheck, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Lịch tuần này", value: data.thisWeekCount, Icon: CalendarRange, tint: "bg-sky-50 text-sky-600" },
  ];

  const preview = (patients ?? []).slice(0, 5);

  return (
    <div className="min-h-full bg-[#eef0f5] p-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] opacity-90">Xin chào 👋</div>
            <div className="text-[20px] font-extrabold">{data.agentName || "CSKH"}</div>
            <div className="mt-1 text-[12.5px] opacity-90">{data.needBookCount} khách đang chờ đặt buổi</div>
          </div>
          <button
            onClick={() => setNotifOpen(true)}
            aria-label="Thông báo"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-95"
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-brand-600">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center rounded-2xl bg-white p-4 text-center shadow-card">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tint}`}>
              <s.Icon size={18} />
            </span>
            <div className="mt-2 text-[24px] font-extrabold leading-none text-slate-800">{s.value}</div>
            <div className="mt-1 text-[12.5px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Khách đang điều trị — bấm để đặt buổi kế */}
      <div className="mb-2 mt-5 flex items-center justify-between px-1">
        <div className="text-[13px] font-bold text-slate-500">Khách đang điều trị</div>
        <button onClick={onGoBooking} className="flex items-center gap-0.5 text-[12.5px] font-semibold text-brand-600">
          Xem tất cả <ChevronRight size={15} />
        </button>
      </div>

      {patients === null ? (
        <div className="flex justify-center py-10 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : preview.length === 0 ? (
        <div className="rounded-2xl bg-white py-10 text-center text-[13.5px] text-slate-400 shadow-card">
          Chưa có khách đang điều trị.
        </div>
      ) : (
        <div className="space-y-2">
          {preview.map((p) => {
            const pct = Math.min(100, Math.round((p.sessionDone / Math.max(1, p.sessionTotal)) * 100));
            return (
              <button
                key={p.id}
                onClick={() => onOpenPatient(p)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card transition-shadow hover:shadow-md"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white"
                  style={{ background: colorOf(p.name) }}
                >
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-slate-800">{p.name}</span>
                    <span className="shrink-0 text-[11.5px] font-semibold text-slate-400">
                      Buổi {p.sessionDone}/{p.sessionTotal || "?"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {notifOpen && (
        <NotificationSheet
          fetcher={fetchCskhNotifications}
          linkPrefix="/cskh/book/"
          onClose={() => { setNotifOpen(false); setUnread(0); }}
        />
      )}
    </div>
  );
}
