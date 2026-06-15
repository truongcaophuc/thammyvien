import { useEffect, useState } from "react";
import {
  PhoneOutgoing,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Bell,
} from "lucide-react";
import { ProgressBar, SectionTitle } from "../components/common";
import { Skeleton } from "../components/Skeleton";
import {
  fetchOverview,
  formatAppointment,
  type Overview as OverviewData,
} from "../lib/overview";
import NotificationSheet from "../modals/NotificationSheet";
import { countUnread, fetchMyNotifications } from "../lib/notifications";

function StatCard({
  icon,
  value,
  label,
  ring,
  iconBg,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  ring: string;
  iconBg: string;
}) {
  return (
    // text-center + mx-auto cho icon → icon/number/label cùng trục giữa.
    <div className="rounded-2xl bg-white p-4 text-center shadow-card">
      <div
        className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
      >
        {icon}
      </div>
      <div className={`text-[26px] font-extrabold leading-none ${ring}`}>
        {value}
      </div>
      <div className="mt-1 text-[13px] font-medium text-slate-500">{label}</div>
    </div>
  );
}

// Cap appointment list ở Overview để màn không dài lê thê khi user có nhiều lịch.
// Nếu vượt cap → hiện link "Xem tất cả" dẫn sang màn chi tiết (TODO route).
const APPOINTMENTS_CAP = 3;

export default function Overview({
  onStartCall,
  onSeeAllAppointments,
}: {
  onStartCall: () => void;
  onSeeAllAppointments: () => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  // Unread = số notif có sentAt > lastViewedAt (localStorage). Re-fetch khi đóng sheet
  // (sau khi đọc xong → mark viewed → count về 0). notifBust = trigger refetch.
  const [unread, setUnread] = useState(0);
  const [notifBust, setNotifBust] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const d = await fetchOverview();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Không tải được tổng quan");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch notification count độc lập với overview — refetch khi notifBust thay đổi.
  // Silent fail nếu BE chưa sẵn sàng — không break UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const notifs = await fetchMyNotifications();
        if (!cancelled) setUnread(countUnread(notifs));
      } catch {
        if (!cancelled) setUnread(0);
      }
    })();
    return () => { cancelled = true; };
  }, [notifBust]);

  if (err) {
    return (
      <div className="px-4 pt-6">
        <div className="rounded-2xl bg-rose-50 p-4 text-center text-[13px] text-rose-600 shadow-card">
          {err}
        </div>
      </div>
    );
  }

  if (!data) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      {/* P3 — Header compact: bỏ date stamp (user biết), thay bằng action message
          tóm tắt today's todo. Bell icon top-right mở Notification sheet. */}
      <div className="overflow-hidden rounded-2xl2 bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-extrabold leading-tight">Xin chào</div>
            <div className="flex items-center gap-2 text-[22px] font-extrabold leading-tight">
              {data.agentName} <span className="text-2xl">👋</span>
            </div>
          </div>
          {/* Bell button — z-index trên gradient để tap được, badge nhỏ unread */}
          <button
            onClick={() => setNotifOpen(true)}
            aria-label="Thông báo"
            className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-95"
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

      {/* 4 thẻ thống kê */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<PhoneOutgoing size={20} className="text-brand-600" />}
          iconBg="bg-brand-100"
          value={data.toCallCount}
          label="Cần gọi hôm nay"
          ring="text-brand-700"
        />
        <StatCard
          icon={<CheckCircle2 size={20} className="text-emerald-600" />}
          iconBg="bg-emerald-100"
          value={data.calledTodayCount}
          label="Đã gọi hôm nay"
          ring="text-emerald-600"
        />
        <StatCard
          icon={<AlertCircle size={20} className="text-rose-600" />}
          iconBg="bg-rose-100"
          value={data.overdueCount}
          label="Quá hạn"
          ring="text-rose-600"
        />
        <StatCard
          icon={<CalendarCheck size={20} className="text-sky-600" />}
          iconBg="bg-sky-100"
          value={data.appointmentCount}
          label="Lịch hẹn thành công"
          ring="text-sky-700"
        />
      </div>

      {/* Tiến độ + nút bắt đầu gọi */}
      <div className="rounded-2xl2 bg-white p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-slate-700">Tiến độ hôm nay</span>
          <span className="font-bold text-brand-600">
            {data.progressDone}/{data.progressTotal}
          </span>
        </div>
        <ProgressBar value={data.progressDone} total={data.progressTotal} />
        <button
          onClick={onStartCall}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-3.5 text-[15px] font-bold text-white shadow-soft transition-transform active:scale-[0.98]"
        >
          <PhoneCall size={19} />
          Bắt đầu gọi
        </button>
      </div>

      {/* Lịch hẹn sắp tới — cap 3 item, hiện link "Xem tất cả" khi vượt */}
      <div>
        <SectionTitle
          icon={<CalendarClock size={18} className="text-brand-600" />}
        >
          Lịch hẹn sắp tới
        </SectionTitle>
        <div className="space-y-3">
          {data.upcomingAppointments.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center text-[13px] text-slate-400 shadow-card">
              Chưa có lịch hẹn sắp tới
            </div>
          )}
          {data.upcomingAppointments.slice(0, APPOINTMENTS_CAP).map((a) => {
            const f = formatAppointment(a);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 leading-none">
                  <span className="text-[15px] font-extrabold text-brand-700">
                    {f.date.split("/")[0]}
                  </span>
                  <span className="text-[10px] font-semibold text-brand-400">
                    /{f.date.split("/")[1]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold text-slate-800">
                    {a.customerName}
                  </div>
                  {/* P4 — sub-text: dayLabel relative (Hôm nay/Mai/T.Bảy) thay
                      vì lặp lại weekday+date. Note customer ở cuối nếu có. */}
                  <div className="truncate text-[12.5px] text-slate-500">
                    {f.dayLabel && (
                      <b className="text-brand-600">{f.dayLabel} · </b>
                    )}
                    {f.time}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </div>
                </div>
                <a
                  href={`tel:${a.phone.replace(/\s/g, "")}`}
                  aria-label={`Gọi nhắc ${a.customerName}`}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition-transform active:scale-95"
                >
                  {/* P5 — PhoneCall (icon có sound wave) thay Phone để phân biệt
                      với "Gọi ngay" plain ở CallList — context "gọi nhắc khách". */}
                  <PhoneCall size={17} />
                </a>
              </div>
            );
          })}
          {data.upcomingAppointments.length > APPOINTMENTS_CAP && (
            // Navigate sang CallList với filter "scheduled" (Đã đặt lịch).
            // Tạm dùng CallList vì chưa có màn riêng "Tất cả lịch hẹn".
            <button
              type="button"
              onClick={onSeeAllAppointments}
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-2xl bg-white py-3 text-[13px] font-semibold text-brand-600 shadow-card transition-colors hover:bg-brand-50"
            >
              Xem tất cả {data.upcomingAppointments.length} lịch hẹn
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {notifOpen && (
        <NotificationSheet
          onClose={() => {
            setNotifOpen(false);
            // Sheet vừa mark viewed → bump bust để re-count unread (về 0)
            setNotifBust((b) => b + 1);
          }}
        />
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      {/* Header gradient — giữ background nhưng nội dung là skeleton */}
      <div className="rounded-2xl2 bg-gradient-to-br from-brand-600 to-brand-500 p-5 shadow-soft">
        <Skeleton className="h-3 w-16 bg-white/30" />
        <Skeleton className="mt-2 h-3 w-40 bg-white/40" />
      </div>

      {/* 4 stat cards — center skeleton chunks đồng bộ với StatCard center alignment */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-white p-4 text-center shadow-card">
            <Skeleton className="mx-auto mb-3 h-10 w-10 rounded-xl" />
            <Skeleton className="mx-auto h-7 w-10" />
            <Skeleton className="mx-auto mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Progress + button */}
      <div className="rounded-2xl2 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="mt-4 h-12 w-full rounded-xl" />
      </div>

      {/* Section title + appointment cards */}
      <div>
        <Skeleton className="mb-3 h-5 w-56" />
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
            >
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-44" />
              </div>
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
