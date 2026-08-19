import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Loader2, MapPin, MonitorCog, Search, Tag } from "lucide-react";
import { fetchTechnicianAppointments, type AppointmentResource, type TechnicianAppointment } from "../../lib/technician";
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
const ROLE_LABELS: Record<string, string> = {
  main: "ĐTV",
  primary_staff: "ĐTV",
  primary_room: "Phòng",
  doctor: "BS",
  equipment: "Máy",
  assistant: "Trợ lý",
};

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

function resourceLabel(r: AppointmentResource): string {
  return ROLE_LABELS[r.role] || r.resourceTypeName || r.role || "Tài nguyên";
}

function resourceTone(r: AppointmentResource): string {
  const s = (r.resourceTypeSlug || r.role || "").toLowerCase();
  if (s.includes("doctor")) return "bg-sky-50 text-sky-600";
  if (s.includes("room")) return "bg-indigo-50 text-indigo-600";
  if (s.includes("equipment") || s.includes("machine")) return "bg-amber-50 text-amber-600";
  if (s.includes("assistant")) return "bg-violet-50 text-violet-600";
  return "bg-slate-100 text-slate-500";
}

function isRoomResource(r: AppointmentResource): boolean {
  const s = `${r.resourceTypeSlug} ${r.role} ${r.resourceTypeName}`.toLowerCase();
  return s.includes("room") || s.includes("phòng") || s.includes("phong");
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
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"time" | "resource">("time");
  const [q, setQ] = useState("");

  // Đổi ngày: xoá list ngay để hiện spinner (không setState trong effect) + nhớ ngày.
  const pickDate = (iso: string) => {
    rememberedDate = iso;
    setItems(null);
    setError("");
    setDate(iso);
  };

  useEffect(() => {
    let cancelled = false;
    const load = (silent: boolean) =>
      fetchTechnicianAppointments(date, date)
        .then((list) => {
          if (!cancelled) {
            setError("");
            setItems(list);
          }
        })
        .catch((e) => {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : "Không tải được lịch hẹn.";
          setError(msg);
          if (!silent) setItems([]);
        });
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

  const resourceGroups = useMemo(() => {
    const m = new Map<string, { resource: AppointmentResource | null; appointments: TechnicianAppointment[] }>();
    for (const a of filtered) {
      const rooms = (a.resources ?? []).filter(isRoomResource);
      const resources = rooms.length ? rooms : [null];
      for (const r of resources) {
        const key = r?.resourceId ?? "__missing";
        const cur = m.get(key) ?? { resource: r, appointments: [] };
        cur.appointments.push(a);
        m.set(key, cur);
      }
    }
    return [...m.values()].sort((a, b) => {
      const an = a.resource ? `${resourceLabel(a.resource)} ${a.resource.resourceName}` : "zz";
      const bn = b.resource ? `${resourceLabel(b.resource)} ${b.resource.resourceName}` : "zz";
      return an.localeCompare(bn, "vi");
    });
  }, [filtered]);

  function AppointmentCard({ a, compact = false }: { a: TechnicianAppointment; compact?: boolean }) {
    const meta = STATUS_META[a.status] ?? { label: a.status || "—", cls: "bg-slate-100 text-slate-500" };
    const off = a.status === "cancelled" || a.status === "no_show";
    return (
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
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
              {(a.tierName || a.lifecycleName) && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={chipStyle(a.tierColor)}
                >
                  <Tag size={11} /> {[a.tierName, a.lifecycleName].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className={`ml-auto shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                {meta.label}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-slate-500">
              {[a.branchName, a.serviceName].filter(Boolean).join(" · ") || "—"}
            </span>
            {!compact && a.resources?.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {a.resources.map((r) => (
                  <span
                    key={`${a.appointmentId}-${r.resourceId}-${r.role}`}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${resourceTone(r)}`}
                  >
                    {r.resourceTypeSlug.includes("room") || r.role.includes("room") ? <MapPin size={11} /> : <MonitorCog size={11} />}
                    <span className="shrink-0">{resourceLabel(r)}:</span>
                    <span className="truncate">{r.resourceName}</span>
                  </span>
                ))}
              </span>
            )}
            {!compact && (!a.resources || a.resources.length === 0) && (
              <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-500">
                Chưa gán tài nguyên
              </span>
            )}
          </span>
        </button>
      </div>
    );
  }

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

        <div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {([["time", "Theo giờ"], ["resource", "Theo phòng"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-lg py-2 text-[12.5px] font-bold transition-colors ${
                view === key ? "bg-white text-brand-600 shadow-sm" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
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
        {error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600">
            {error}
          </div>
        ) : items === null ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-slate-400">
            {items.length === 0 ? "Ngày này chưa có lịch hẹn nào." : "Không có lịch hẹn phù hợp."}
          </div>
        ) : view === "time" ? (
          filtered.map((a) => <AppointmentCard key={a.appointmentId} a={a} />)
        ) : (
          <div className="space-y-3">
            {resourceGroups.map((g) => (
              <section key={g.resource?.resourceId ?? "__missing"} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    g.resource ? resourceTone(g.resource) : "bg-rose-50 text-rose-500"
                  }`}>
                    {g.resource ? "Phòng" : "Chưa gán"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700">
                    {g.resource?.resourceName ?? "Chưa gán phòng"}
                  </span>
                  <span className="text-[11.5px] font-semibold text-slate-400">{g.appointments.length} lịch</span>
                </div>
                <div className="space-y-2">
                  {g.appointments.map((a) => <AppointmentCard key={`${g.resource?.resourceId ?? "missing"}-${a.appointmentId}`} a={a} compact />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
