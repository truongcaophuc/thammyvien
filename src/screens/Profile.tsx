import { useEffect, useState } from "react";
import {
  Trophy,
  Bell,
  BellOff,
  FileText,
  HelpCircle,
  LogOut,
  ChevronRight,
  Loader2,
  Send,
} from "lucide-react";
import { Avatar } from "../components/common";
import { Skeleton } from "../components/Skeleton";
import { logout } from "../lib/auth";
import { fetchProfile, type Profile as ProfileData } from "../lib/profile";
import {
  isPushSupported,
  getPermission,
  getCurrentSubscription,
  subscribePush,
  unsubscribePush,
  sendTestPush,
} from "../lib/pushNotification";

const menu = [
  { icon: FileText, label: "Báo cáo của tôi" },
  { icon: HelpCircle, label: "Trợ giúp & hỗ trợ" },
];

export default function Profile({ onLoggedOut }: { onLoggedOut?: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [data, setData] = useState<ProfileData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        const d = await fetchProfile();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Không tải được hồ sơ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      onLoggedOut?.();
    }
  };

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
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      {/* Thẻ hồ sơ */}
      <div className="flex items-center gap-4 rounded-2xl2 bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-soft">
        <Avatar name={data.agentName} size={60} />
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold">{data.agentName}</div>
          <div className="text-[12.5px] text-white/85">{data.agentRole}</div>
        </div>
      </div>

      {/* Thành tích tháng */}
      <div className="rounded-2xl2 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-800">
          <Trophy size={18} className="text-amber-500" /> Thành tích tháng này
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-brand-50 py-3">
            <div className="text-[22px] font-extrabold text-brand-700">{data.monthlyCallCount}</div>
            <div className="text-[11.5px] font-medium text-slate-500">Cuộc gọi</div>
          </div>
          <div className="rounded-xl bg-emerald-50 py-3">
            <div className="text-[22px] font-extrabold text-emerald-600">{data.monthlyAppointmentCount}</div>
            <div className="text-[11.5px] font-medium text-slate-500">Lịch hẹn</div>
          </div>
          <div className="rounded-xl bg-amber-50 py-3">
            <div className="text-[22px] font-extrabold text-amber-600">{data.monthlyConnectRatePct}%</div>
            <div className="text-[11.5px] font-medium text-slate-500">Kết nối</div>
          </div>
        </div>
      </div>

      {/* Thông báo push */}
      <PushNotificationCard />

      {/* Menu */}
      <div className="overflow-hidden rounded-2xl2 bg-white shadow-card">
        {menu.map(({ icon: Icon, label }, i) => (
          <button
            key={label}
            className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 ${
              i > 0 ? "border-t border-slate-100" : ""
            }`}
          >
            <Icon size={19} className="text-slate-500" />
            <span className="flex-1 text-[14.5px] font-medium text-slate-700">{label}</span>
            <ChevronRight size={18} className="text-slate-300" />
          </button>
        ))}
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl2 bg-white py-3.5 text-[14.5px] font-bold text-rose-500 shadow-card transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
        {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
      </button>
    </div>
  );
}

function PushNotificationCard() {
  const supported = isPushSupported();
  const [permission, setPermission] = useState(supported ? getPermission() : "denied");
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!supported) {
      setIsSubscribed(false);
      return;
    }
    (async () => {
      const sub = await getCurrentSubscription();
      setIsSubscribed(!!sub);
    })();
  }, [supported]);

  if (!supported) {
    return (
      <div className="flex items-center gap-3 rounded-2xl2 bg-white p-4 shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <BellOff size={20} />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-bold text-slate-800">Thông báo đẩy</div>
          <div className="text-[12.5px] text-slate-500">Trình duyệt không hỗ trợ — thử Chrome hoặc Safari trên iOS 16.4+</div>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (isSubscribed) {
        const r = await unsubscribePush();
        if (r.ok) {
          setIsSubscribed(false);
          setMsg({ tone: "ok", text: "Đã tắt thông báo đẩy" });
        } else {
          setMsg({ tone: "err", text: r.reason ?? "Không tắt được" });
        }
      } else {
        const r = await subscribePush();
        if (r.ok) {
          setIsSubscribed(true);
          setPermission(getPermission());
          setMsg({ tone: "ok", text: "Đã bật — bạn sẽ nhận nhắc lịch hẹn và lead mới" });
        } else {
          setMsg({ tone: "err", text: r.reason ?? "Không bật được" });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush();
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: "ok", text: `Đã gửi tới ${r.sent ?? 0} thiết bị — kiểm tra notification` });
    } else {
      setMsg({ tone: "err", text: r.reason ?? "Gửi test thất bại" });
    }
  };

  const blockedByBrowser = permission === "denied";

  return (
    <div className="rounded-2xl2 bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isSubscribed ? "bg-brand-100 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
          {isSubscribed ? <Bell size={20} /> : <BellOff size={20} />}
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-bold text-slate-800">Thông báo đẩy</div>
          <div className="text-[12.5px] text-slate-500">
            {isSubscribed
              ? "Đang nhận nhắc lịch hẹn và khách hàng mới được phân bổ"
              : blockedByBrowser
                ? "Đã bị chặn — vào cài đặt trình duyệt để cấp lại quyền"
                : "Nhắc lịch hẹn trước 15 phút và thông báo khi có khách hàng mới"}
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={busy || blockedByBrowser}
          className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            isSubscribed
              ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
              : "bg-brand-600 text-white hover:bg-brand-500"
          }`}
        >
          {busy ? <Loader2 size={14} className="inline animate-spin" /> : isSubscribed ? "Tắt" : "Bật"}
        </button>
      </div>

      {isSubscribed && (
        <button
          onClick={handleTest}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-[12.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <Send size={14} /> Gửi thử 1 thông báo
        </button>
      )}

      {msg && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-[12px] ${msg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      {/* Header gradient card */}
      <div className="flex items-center gap-4 rounded-2xl2 bg-gradient-to-br from-brand-600 to-brand-500 p-5 shadow-soft">
        <Skeleton className="h-[60px] w-[60px] shrink-0 rounded-full bg-white/30" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-32 bg-white/40" />
          <Skeleton className="mt-2 h-3 w-24 bg-white/30" />
        </div>
      </div>

      {/* Thành tích tháng */}
      <div className="rounded-2xl2 bg-white p-4 shadow-card">
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-slate-50 py-3 text-center">
              <Skeleton className="mx-auto h-6 w-10" />
              <Skeleton className="mx-auto mt-2 h-3 w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* Hôm nay */}
      <div className="flex items-center gap-3 rounded-2xl2 bg-white p-4 shadow-card">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-3 w-44" />
        </div>
      </div>

      {/* Menu items */}
      <div className="overflow-hidden rounded-2xl2 bg-white shadow-card">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex w-full items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
          >
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
