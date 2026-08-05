import { useEffect, useMemo, useState } from "react";
import { chipStyle } from "../../lib/chipColor";
import { Loader2, Search, SlidersHorizontal, X, AlertTriangle, MessageCircle, Check } from "lucide-react";
import { fetchCarePatients, fetchCareRhythmPhases, logCareInteraction, type CareRhythmPhase } from "../../lib/customerCare";
import type { Patient } from "../../lib/technician";

// CV-08: ngưỡng lấy từ giai đoạn (bảng CareRhythmPhase, quản trị trên web) -> server trả overdueDays.
// overdueDays null = khách không tính nhịp (đã bỏ liệu trình / ngừng chăm).
function careRhythm(p: Patient): { text: string; cls: string } {
  const od = p.overdueDays;
  if (od != null) {
    if (od > 0) return { text: `Trễ ${od} ngày`, cls: "text-rose-600" };
    if (od === 0) return { text: "Tới hạn hôm nay", cls: "text-amber-600" };
  }
  const days = p.daysSinceInteraction;
  if (days === undefined || days < 0) return { text: "Chưa chăm lần nào", cls: "text-slate-400" };
  if (days === 0) return { text: "Đã chăm hôm nay", cls: "text-emerald-600" };
  if (days === 1) return { text: "Chăm hôm qua", cls: "text-slate-500" };
  return { text: `${days} ngày chưa chăm`, cls: "text-slate-500" };
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Avatar: 2 chữ cái + màu hash cố định (đồng bộ danh sách ĐTV + overview).
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

export default function CustomerCareList({ onOpenPatient }: { onOpenPatient: (p: Patient) => void }) {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [careFilter, setCareFilter] = useState<string | null>(null);
  // Chiều phụ (lọc qua bottom-sheet "Bộ lọc") — hiện có satisfaction, chừa chỗ thêm về sau.
  const [satisFilter, setSatisFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);   // CV-07: lọc theo giai đoạn
  const [overdueOnly, setOverdueOnly] = useState(false);                 // CV-08: chỉ khách đang trễ
  const [phases, setPhases] = useState<CareRhythmPhase[]>([]);           // guồng: thứ tự + đủ giai đoạn
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tickBusy, setTickBusy] = useState<string | null>(null); // CV-23: khách đang lưu tick

  // CV-23: tích/bỏ tích "đã nhắn/gọi hôm nay". Optimistic, lỗi thì trả lại trạng thái cũ.
  async function toggleInteraction(p: Patient) {
    if (tickBusy) return;
    setTickBusy(p.id);
    const before = { today: p.interactedToday, days: p.daysSinceInteraction, at: p.lastInteractionAt };
    const patch = (v: Partial<Patient>) =>
      setPatients((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, ...v } : x)));
    patch({ interactedToday: !before.today, daysSinceInteraction: before.today ? before.days : 0 });
    try {
      const r = await logCareInteraction(p.id);
      patch({
        interactedToday: r.interactedToday,
        daysSinceInteraction: r.daysSinceInteraction,
        lastInteractionAt: r.lastInteractionAt,
      });
    } catch {
      patch({ interactedToday: before.today, daysSinceInteraction: before.days, lastInteractionAt: before.at });
    } finally {
      setTickBusy(null);
    }
  }

  // Chip filter theo tình trạng chăm sóc — đếm từ list đã tải (thứ tự theo mức churn).
  const careChips = useMemo(() => {
    const ORDER = ["Đang kết nối", "Ít kết nối", "Không kết nối", "Bỏ liệu trình", "Ngừng chăm", "Kích ứng / Sự cố"];
    const m = new Map<string, { count: number; color: string }>();
    (patients ?? []).forEach((p) => {
      if (!p.careStatus) return;
      const e = m.get(p.careStatus) || { count: 0, color: p.careStatusColor || "#94a3b8" };
      e.count++;
      m.set(p.careStatus, e);
    });
    return [...m.entries()]
      .sort((a, b) => (ORDER.indexOf(a[0]) < 0 ? 99 : ORDER.indexOf(a[0])) - (ORDER.indexOf(b[0]) < 0 ? 99 : ORDER.indexOf(b[0])))
      .map(([label, e]) => ({ label, ...e }));
  }, [patients]);

  // Tùy chọn "Mức hài lòng" cho sheet — đếm từ list (thứ tự tốt→xấu).
  const satisOpts = useMemo(() => {
    const ORDER = ["Hài lòng", "Chưa hài lòng kết quả", "Complain"];
    const m = new Map<string, { count: number; color: string }>();
    (patients ?? []).forEach((p) => {
      if (!p.satisfaction) return;
      const e = m.get(p.satisfaction) || { count: 0, color: p.satisfactionColor || "#94a3b8" };
      e.count++;
      m.set(p.satisfaction, e);
    });
    return [...m.entries()]
      .sort((a, b) => (ORDER.indexOf(a[0]) < 0 ? 99 : ORDER.indexOf(a[0])) - (ORDER.indexOf(b[0]) < 0 ? 99 : ORDER.indexOf(b[0])))
      .map(([label, e]) => ({ label, ...e }));
  }, [patients]);

  // Thứ hạng guồng theo slug -> dùng để xếp danh sách việc đúng trình tự cấu hình trên web.
  const phaseRank = useMemo(() => {
    const m = new Map<string, number>();
    phases.forEach((ph, i) => m.set(ph.slug, i));
    return m;
  }, [phases]);

  // Chip lọc dựng từ DANH SÁCH GIAI ĐOẠN, không gom từ khách -> giai đoạn trống vẫn hiện (đếm 0).
  const phaseOpts = useMemo(() => {
    const count = new Map<string, number>();
    (patients ?? []).forEach((p) => {
      if (p.carePhaseSlug) count.set(p.carePhaseSlug, (count.get(p.carePhaseSlug) ?? 0) + 1);
    });
    return phases.map((ph) => ({
      slug: ph.slug,
      label: ph.name,
      color: ph.color || "#94a3b8",
      count: count.get(ph.slug) ?? 0,
    }));
  }, [phases, patients]);

  const overdueCount = useMemo(
    () => (patients ?? []).filter((p) => (p.overdueDays ?? -1) > 0).length,
    [patients],
  );

  const secondaryCount = (satisFilter ? 1 : 0) + (phaseFilter ? 1 : 0); // số filter phụ đang bật (cho badge)

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCarePatients()
      .then((ps) => { if (!cancelled) setPatients(ps); })
      .catch(() => { if (!cancelled) setPatients([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Song song với danh sách khách nên không tốn thêm thời gian chờ.
    fetchCareRhythmPhases().then((ph) => { if (!cancelled) setPhases(ph); }).catch(() => {});
    // Live: push đến (SW) / app hiện lại -> refetch tại chỗ (không spinner, giữ ô tìm kiếm).
    const refresh = () => fetchCarePatients().then((ps) => { if (!cancelled) setPatients(ps); }).catch(() => {});
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("sw-push", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("sw-push", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const filtered = (patients ?? [])
    .filter((p) => {
      if (careFilter && p.careStatus !== careFilter) return false;
      if (satisFilter && p.satisfaction !== satisFilter) return false;
      if (phaseFilter && p.carePhaseSlug !== phaseFilter) return false;
      if (overdueOnly && (p.overdueDays ?? -1) <= 0) return false;
      const hay = (p.name + " " + p.phone + " " + p.service).toLowerCase();
      return !q.trim() || hay.includes(q.trim().toLowerCase());
    })
    // CV-07 "guồng": sự cố trước → theo trình tự giai đoạn đã cấu hình → trong mỗi giai đoạn
    // thì trễ nhiều lên trước. Giai đoạn lạ/không tính nhịp xuống cuối.
    .sort(
      (a, b) =>
        (b.careIncident ? 1 : 0) - (a.careIncident ? 1 : 0) ||
        (phaseRank.get(a.carePhaseSlug ?? "") ?? 99) - (phaseRank.get(b.carePhaseSlug ?? "") ?? 99) ||
        (b.overdueDays ?? -9999) - (a.overdueDays ?? -9999),
    );

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Việc hôm nay</h1>
        <p className="mt-0.5 text-[12.5px] text-slate-400">Xếp theo guồng chăm sóc · khách trễ nhịp lên trước</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tên / SĐT / liệu trình…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Bộ lọc"
            className={`relative flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
              secondaryCount > 0 ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            <SlidersHorizontal size={16} />
            Lọc
            {secondaryCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                {secondaryCount}
              </span>
            )}
          </button>
        </div>
        {careChips.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5" style={{ scrollbarWidth: "none" }}>
            {overdueCount > 0 && (
              <button
                onClick={() => setOverdueOnly((v) => !v)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${
                  overdueOnly ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600"
                }`}
              >
                <AlertTriangle size={13} /> Đang trễ <span className="opacity-80">{overdueCount}</span>
              </button>
            )}
            <button
              onClick={(e) => { setCareFilter(null); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${!careFilter ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}
            >
              Tất cả <span className="opacity-70">{(patients ?? []).length}</span>
            </button>
            {careChips.map((c) => {
              const on = careFilter === c.label;
              return (
                <button
                  key={c.label}
                  onClick={(e) => { setCareFilter(on ? null : c.label); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition"
                  style={chipStyle(c.color, on)}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c.color }} />
                  {c.label} <span className="opacity-80">{c.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="space-y-2.5 p-4">
        {patients === null || loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-slate-400">Không có khách phù hợp.</div>
        ) : (
          filtered.map((p) => (
            // Thẻ là <div> chứ không phải <button>: bên trong có nút tích CV-23 riêng,
            // lồng button trong button là HTML không hợp lệ.
            <div
              key={p.id}
              className={`relative rounded-2xl border shadow-sm transition-shadow hover:shadow-md ${
                p.careIncident ? "border-red-300 bg-red-50/70 ring-1 ring-red-200" : "border-slate-100 bg-white"
              }`}
            >
            <button
              onClick={() => onOpenPatient(p)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold text-white"
                style={{ background: colorOf(p.name) }}
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {p.careIncident && <AlertTriangle size={14} className="shrink-0 text-red-500" />}
                  <div className="truncate text-[15px] font-bold text-slate-800">{p.name}</div>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-500">{p.service}</div>
                <div className="mt-1.5 flex items-center justify-between text-[12px] text-slate-400">
                  <span className="font-semibold text-slate-500">Buổi {p.sessionDone}/{p.sessionTotal}</span>
                  <span>Hẹn gần nhất: {fmtDate(p.lastCareAt)}</span>
                </div>
              </div>
              {(p.careStatus || p.satisfaction) && (
                <div className="absolute right-3 top-2.5 flex flex-col items-end gap-1">
                  {p.careStatus && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={chipStyle(p.careStatusColor)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.careStatusColor || "#94a3b8" }} />
                      {p.careStatus}
                    </span>
                  )}
                  {p.satisfaction && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={chipStyle(p.satisfactionColor)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.satisfactionColor || "#94a3b8" }} />
                      {p.satisfaction}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* CV-23: CV tự xác nhận đã nhắn/gọi hôm nay — nguồn duy nhất để đo nhịp chăm (NT3) */}
            {(() => {
              const rhythm = careRhythm(p);
              const on = !!p.interactedToday;
              return (
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.carePhase && (
                      <span
                        className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style={chipStyle(p.carePhaseColor)}
                      >
                        {p.carePhase}
                      </span>
                    )}
                    <span className={`truncate text-[12px] font-semibold ${rhythm.cls}`}>{rhythm.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleInteraction(p)}
                    disabled={tickBusy === p.id}
                    aria-pressed={on}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition active:scale-95 disabled:opacity-60 ${
                      on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tickBusy === p.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : on ? (
                      <Check size={13} />
                    ) : (
                      <MessageCircle size={13} />
                    )}
                    {on ? "Đã nhắn/gọi" : "Tích đã nhắn/gọi"}
                  </button>
                </div>
              );
            })()}
            </div>
          ))
        )}
      </div>

      {/* Bottom sheet "Bộ lọc" — chiều phụ (satisfaction; chừa chỗ thêm chiều khác) */}
      <div className={`fixed inset-0 z-30 ${sheetOpen ? "" : "pointer-events-none"}`} aria-hidden={!sheetOpen}>
        <div
          onClick={() => setSheetOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${sheetOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ${sheetOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-[15px] font-bold text-slate-800">Bộ lọc</div>
            <button onClick={() => setSheetOpen(false)} aria-label="Đóng" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
            {phaseOpts.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Giai đoạn chăm sóc</div>
                <div className="flex flex-wrap gap-2">
                  {phaseOpts.map((o) => {
                    const on = phaseFilter === o.slug;
                    return (
                      <button
                        key={o.slug}
                        onClick={() => setPhaseFilter(on ? null : o.slug)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95"
                        style={chipStyle(o.color, on)}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : o.color }} />
                        {o.label} <span className="opacity-80">{o.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Mức hài lòng</div>
              {satisOpts.length === 0 ? (
                <div className="text-[13px] text-slate-400">Chưa có khách nào được gắn mức hài lòng.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {satisOpts.map((o) => {
                    const on = satisFilter === o.label;
                    return (
                      <button
                        key={o.label}
                        onClick={() => setSatisFilter(on ? null : o.label)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95"
                        style={chipStyle(o.color, on)}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : o.color }} />
                        {o.label} <span className="opacity-80">{o.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div
            className="flex gap-2 border-t border-slate-100 px-4 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => { setSatisFilter(null); setPhaseFilter(null); }}
              disabled={secondaryCount === 0}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[14px] font-semibold text-slate-600 transition disabled:opacity-40"
            >
              Xóa lọc
            </button>
            <button onClick={() => setSheetOpen(false)} className="flex-1 rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]">
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

