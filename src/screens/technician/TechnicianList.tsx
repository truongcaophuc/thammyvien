import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, MessageCircle, Star, Clock } from "lucide-react";
import {
  fetchMyPatientsPage,
  PATIENTS_PAGE_SIZE,
  type Patient,
  type PatientFacet,
} from "../../lib/technician";
import { TierChip, LifecycleChip, PaymentChip } from "../../components/PatientTags";
import { chipStyle, chipDot } from "../../lib/chipColor";

// ISO -> dd/mm/yyyy (bỏ giờ). Rỗng/không hợp lệ -> "—".
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Số ngày kể từ buổi gần nhất (dùng cho nhãn tương đối + cờ quá hạn).
function daysSince(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
// Buổi gần nhất theo kiểu "hôm nay / 3 ngày trước / 2 tuần trước / dd/mm/yyyy".
function fmtRelative(iso: string): string {
  const n = daysSince(iso);
  if (n == null) return "—";
  if (n <= 0) return "Hôm nay";
  if (n === 1) return "Hôm qua";
  if (n < 7) return `${n} ngày trước`;
  if (n < 30) return `${Math.floor(n / 7)} tuần trước`;
  return fmtDate(iso);
}
// Avatar: 2 chữ cái đầu/cuối + màu hash cố định (đồng bộ thẻ khách CEP).
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
// Một trang đã tải, kèm bộ lọc sinh ra nó. So key với bộ lọc hiện tại là biết dữ liệu còn
// dùng được hay đang chờ tải lại — không cần thêm state "loading" riêng.
interface PageState {
  key: string;
  items: Patient[];
  total: number;
  facets: PatientFacet[];
  exhausted: boolean;   // trang cuối trả về ít hơn PATIENTS_PAGE_SIZE -> hết khách
}

export default function TechnicianList({ onOpenPatient }: { onOpenPatient: (p: Patient) => void }) {
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Tìm kiếm chạy ở SERVER nên phải hoãn: gõ 1 ký tự = 1 query. 300ms là mức không thấy trễ
  // khi gõ mà vẫn gộp được cả cụm từ thành một lần gọi.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Dữ liệu mang theo BỘ LỌC đã sinh ra nó. Nhờ vậy "đang tải trang 1" là thứ SUY RA được
  // (key lệch bộ lọc hiện tại) chứ không phải một setState(null) chạy trong effect — cách đó
  // tạo thêm một vòng render thừa mỗi lần đổi bộ lọc.
  const [page, setPage] = useState<PageState | null>(null);
  const filterKey = `${qDebounced}|${tierFilter ?? ""}`;
  const fresh = page && page.key === filterKey ? page : null;   // null = chưa có dữ liệu cho bộ lọc này

  // Chống race: đổi bộ lọc liên tục thì phản hồi cũ có thể về SAU phản hồi mới và ghi đè lên.
  // Mỗi lần tải mang một số thứ tự, chỉ kết quả của lần mới nhất được nhận.
  const runId = useRef(0);

  const loadFirstPage = useCallback(() => {
    const my = ++runId.current;
    fetchMyPatientsPage({ skip: 0, take: PATIENTS_PAGE_SIZE, search: qDebounced, tier: tierFilter })
      .then((p) => {
        if (my !== runId.current) return;
        setPage({
          key: filterKey,
          items: p.items,
          total: p.total,
          facets: p.facets,
          exhausted: p.items.length < PATIENTS_PAGE_SIZE,
        });
      })
      .catch(() => {
        if (my !== runId.current) return;
        setPage({ key: filterKey, items: [], total: 0, facets: [], exhausted: true });
      });
  }, [filterKey, qDebounced, tierFilter]);

  // Đổi từ khoá / chip -> luôn quay về trang 1.
  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  // Live: push đến (SW) / app hiện lại -> nạp lại trang 1.
  // Cố ý KHÔNG giữ các trang đã cuộn: thứ tự trên server đã đổi (khách vừa sửa nhảy lên đầu)
  // nên ghép trang cũ vào sẽ ra danh sách lẫn lộn, có khách xuất hiện hai lần.
  useEffect(() => {
    const refresh = () => loadFirstPage();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("sw-push", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("sw-push", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !fresh || fresh.exhausted) return;
    const my = runId.current;
    setLoadingMore(true);
    fetchMyPatientsPage({ skip: fresh.items.length, take: PATIENTS_PAGE_SIZE, search: qDebounced, tier: tierFilter })
      .then((p) => {
        if (my !== runId.current) return;   // bộ lọc đã đổi giữa chừng -> bỏ trang này
        setPage((prev) => (prev && prev.key === filterKey
          ? { ...prev, items: [...prev.items, ...p.items], exhausted: p.items.length < PATIENTS_PAGE_SIZE }
          : prev));
      })
      // Hạ cờ VÔ ĐIỀU KIỆN: nếu chỉ hạ khi còn đúng lượt, một lần đổi bộ lọc giữa chừng sẽ
      // treo cờ vĩnh viễn và loadMore() từ đó về sau luôn thoát sớm — cuộn tải tiếp chết hẳn.
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loadingMore, fresh, filterKey, qDebounced, tierFilter]);

  // Cuộn gần chạm đáy thì tự tải tiếp (không cần bấm nút).
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, {
      rootMargin: "300px",   // tải trước khi khách nhìn thấy đáy
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Server đã lọc + sắp xếp; client chỉ hiển thị đúng thứ tự nhận được. KHÔNG sort lại ở đây —
  // sort cục bộ trên vài trang đã tải sẽ đảo chỗ khách so với trang chưa tải.
  const list = fresh?.items ?? [];
  // Cùng lý do với chip: giữ tổng cũ trong lúc tải để số trên "Tất cả" không nhảy về 0.
  const total = page?.total ?? 0;

  // Chip lọc: số đếm lấy từ server (toàn bộ tập khách), thứ tự hiển thị vẫn do app quyết.
  // Giữ chip của lần tải trước trong lúc đang tải bộ lọc mới -> hàng chip không nhấp nháy.
  const tierChips = useMemo(() => {
    const ORDER = ["KH mới", "KH cũ", "Thường", "VIP"];
    const rank = (s: string) => (ORDER.indexOf(s) < 0 ? 99 : ORDER.indexOf(s));
    return [...(page?.facets ?? [])]
      .sort((a, b) => rank(a.name) - rank(b.name))
      .map((f) => ({ label: f.name, count: f.count, color: f.color || "#94a3b8" }));
  }, [page]);

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Khách hàng</h1>
        <p className="mt-0.5 text-[12.5px] text-slate-400">Cập nhật phác đồ &amp; nhật ký từng buổi</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên / SĐT / liệu trình…"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none placeholder:text-slate-400"
          />
        </div>
        {tierChips.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setTierFilter(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                !tierFilter ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              Tất cả <span className="opacity-70">{total}</span>
            </button>
            {tierChips.map((c) => {
              const on = tierFilter === c.label;
              return (
                <button
                  key={c.label}
                  onClick={(e) => { setTierFilter(on ? null : c.label); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition"
                  style={chipStyle(c.color, on)}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: chipDot(c.color, on) }} />
                  {c.label} <span className="opacity-80">{c.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="space-y-2.5 p-4">
        {fresh === null ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-slate-400">Không có khách phù hợp.</div>
        ) : (
          list.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenPatient(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold text-white"
                style={{ background: colorOf(p.name) }}
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-bold text-slate-800">{p.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {typeof p.qaScore === "number" && (
                      <span className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold ${
                        p.qaScore >= 90 ? "bg-emerald-50 text-emerald-600" : p.qaScore >= 75 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        <Star size={11} /> {p.qaScore}
                      </span>
                    )}
                    {p.tierSlug === "vip" && <TierChip p={p} />}
                    <PaymentChip p={p} />
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
                  {p.service || "Chưa có liệu trình"}
                </div>
                <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2 text-[11.5px]">
                  <LifecycleChip p={p} subtle />
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {p.zaloGroupUrl && <MessageCircle size={13} className="text-sky-500" />}
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Clock size={11} /> {fmtRelative(p.lastCareAt)}
                    </span>
                  </span>
                </div>
              </div>
            </button>
          ))
        )}

        {/* Mốc cuộn: lọt vào tầm nhìn (sớm 300px) thì nạp trang tiếp theo. */}
        {fresh !== null && !fresh.exhausted && <div ref={sentinel} className="h-1" />}
        {loadingMore && (
          <div className="flex justify-center py-4 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {fresh !== null && fresh.exhausted && list.length >= PATIENTS_PAGE_SIZE && (
          <div className="py-4 text-center text-[12px] text-slate-400">Đã hết danh sách</div>
        )}
      </div>
    </div>
  );
}
