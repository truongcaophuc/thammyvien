import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Loader2, Search, Stethoscope, Tag, UserRound } from "lucide-react";
import { fetchTechnicianAppointments, type TechnicianAppointment } from "../../lib/technician";
import { chipStyle } from "../../lib/chipColor";

// Nhãn + màu trạng thái buổi (khuôn lấy từ CustomerCareBook, thêm cancelled/no_show
// vì tab lịch hẹn hiển thị cả buổi huỷ/vắng).
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Chờ", cls: "bg-slate-100 text-slate-500" },
  confirmed: { label: "Đã xác nhận", cls: "bg-sky-50 text-sky-600" },
  arrived: { label: "Đã đến", cls: "bg-indigo-50 text-indigo-600" },
  checked_in: { label: "Đang làm", cls: "bg-amber-50 text-amber-600" },
  completed: { label: "Hoàn thành", cls: "bg-emerald-50 text-emerald-600" },
  cancelled: { label: "Đã huỷ", cls: "bg-rose-50 text-rose-500" },
  no_show: { label: "Vắng", cls: "bg-rose-50 text-rose-500" },
};

const FILTERS: { key: string; label: string; match: string[] | null }[] = [
  { key: "all", label: "Tất cả", match: null },
  { key: "pending", label: "Chờ", match: ["pending"] },
  { key: "confirmed", label: "Đã xác nhận", match: ["confirmed"] },
  { key: "doing", label: "Đang làm", match: ["arrived", "checked_in"] },
  { key: "completed", label: "Xong", match: ["completed"] },
  { key: "off", label: "Huỷ / vắng", match: ["cancelled", "no_show"] },
];

const WEEKDAYS_SHORT_VI = ["CN", "T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy"];

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localTodayIso(): string {
  return isoOf(new Date());
}
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + days));
}
function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Dải 7 ngày bắt đầu từ `anchor`; nhãn tương đối so với hôm nay.
function buildDays(anchorIso: string): { iso: string; label: string; date: string }[] {
  const today = localTodayIso();
  const out: { iso: string; label: string; date: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = shiftIso(anchorIso, i);
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const label =
      iso === today ? "Hôm nay"
      : iso === shiftIso(today, 1) ? "Mai"
      : iso === shiftIso(today, -1) ? "Hôm qua"
      : WEEKDAYS_SHORT_VI[dt.getDay()];
    out.push({ iso, label, date: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}` });
  }
  return out;
}

// Giữ ngày đang xem khi rời tab rồi quay lại (khuôn `rememberedFilter` ở CallList).
let rememberedDate = "";

export default function TechnicianAppointments() {
  const navigate = useNavigate();
  const [date, setDate] = useState(() => rememberedDate || localTodayIso());
  // Dải ngày bắt đầu từ hôm trước ngày đang chọn -> ngày chọn luôn nằm trong dải.
  const [anchor, setAnchor] = useState(() => shiftIso(rememberedDate || localTodayIso(), -1));
  const [items, setItems] = useState<TechnicianAppointment[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  // Đổi ngày: xoá list ngay để hiện spinner (không setState trong effect) + nhớ ngày.
  const pickDate = (iso: string) => {
    rememberedDate = iso;
    setItems(null);
    setDate(iso);
  };

  useEffect(() => {
    let cancelled = false;
    const load = (silent: boolean) =>
      fetchTechnicianAppointments(date, date)
        .then((list) => { if (!cancelled) setItems(list); })
        .catch(() => { if (!cancelled && !silent) setItems([]); });
    load(false);
    // Live: push đến (SW) / app hiện lại -> refetch tại chỗ (không spinner).
    const refresh = () => { load(true); };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("sw-push", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("sw-push", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [date]);

  const counts = useMemo(() => {
    const list = items ?? [];
    const out: Record<string, number> = {};
    for (const f of FILTERS) out[f.key] = f.match ? list.filter((a) => f.match!.includes(a.status)).length : list.length;
    return out;
  }, [items]);

  const days = useMemo(() => buildDays(anchor), [anchor]);

  const filtered = (items ?? []).filter((a) => {
    const f = FILTERS.find((x) => x.key === filter);
    if (f?.match && !f.match.includes(a.status)) return false;
    const term = q.trim().toLowerCase();
    return !term || (a.customerName + " " + a.customerPhone).toLowerCase().includes(term);
  });

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 bg-white px-5 pb-4 pt-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-slate-800">Lịch hẹn</h1>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500">
            <CalendarDays size={15} className="text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                pickDate(v);
                setAnchor(shiftIso(v, -1));
              }}
              className="w-[108px] bg-transparent outline-none"
              aria-label="Chọn ngày"
            />
          </label>
        </div>

        <div className="-mx-5 mt-4 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => {
            const on = d.iso === date;
            return (
              <button
                key={d.iso}
                onClick={(e) => { pickDate(d.iso); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
                className={`flex min-w-[66px] shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                  on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                <span className="text-[11px] font-semibold">{d.label}</span>
                <span className={`text-[13px] font-bold ${on ? "text-white" : "text-slate-700"}`}>{d.date}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên / SĐT…"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="-mx-5 mt-3.5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={(e) => { setFilter(f.key); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
                className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {f.label}
                {/* Luôn render (kể cả lúc đang tải) — ẩn/hiện theo `items` làm chip co giãn, nhấp nháy khi đổi ngày. */}
                <span className={`min-w-[0.9rem] text-center text-[11.5px] font-bold ${on ? "text-white/70" : "text-slate-400"}`}>
                  {items === null ? "" : counts[f.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="space-y-2.5 px-5 py-4">
        {items === null ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-slate-400">
            {items.length === 0 ? "Ngày này chưa có lịch hẹn nào." : "Không có lịch hẹn phù hợp."}
          </div>
        ) : (
          filtered.map((a) => {
            const meta = STATUS_META[a.status] ?? { label: a.status || "—", cls: "bg-slate-100 text-slate-500" };
            const off = a.status === "cancelled" || a.status === "no_show";
            return (
              // Bọc div ngoài, button trong — không lồng button vào button.
              <div key={a.appointmentId} className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <button
                  onClick={() => navigate(`/technician/patient/${a.customerId}`)}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <span className="w-[52px] shrink-0 pt-0.5">
                    <span className={`block text-[15px] font-bold ${off ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {formatHm(a.startAtIso)}
                    </span>
                    {a.sessionNumber != null && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">
                        Buổi {a.sessionNumber}{a.sessionTotal > 0 ? `/${a.sessionTotal}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-bold text-slate-800">{a.customerName}</span>
                      {/* Phân loại KH — chỉ HIỂN THỊ; sửa ở màn chi tiết khách. */}
                      {a.tierName && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={chipStyle(a.tierColor)}
                        >
                          <Tag size={11} /> {a.tierName}
                        </span>
                      )}
                      <span className={`ml-auto shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-slate-500">
                      {[a.branchName, a.serviceName].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {(a.therapistName || a.doctorName) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400">
                        {a.therapistName && (
                          <span className="inline-flex items-center gap-1"><UserRound size={12} /> {a.therapistName}</span>
                        )}
                        {a.doctorName && (
                          <span className="inline-flex items-center gap-1"><Stethoscope size={12} /> {a.doctorName}</span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
