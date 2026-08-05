import { useEffect, useState } from "react";
import { Loader2, Search, MessageCircle, Star, Clock } from "lucide-react";
import { fetchMyPatients, type Patient } from "../../lib/technician";

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
export default function TechnicianList({ onOpenPatient }: { onOpenPatient: (p: Patient) => void }) {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMyPatients().then((ps) => { if (!cancelled) setPatients(ps); });
    // Live: push đến (SW) / app hiện lại -> refetch danh sách tại chỗ (không spinner).
    const refresh = () => fetchMyPatients().then((ps) => { if (!cancelled) setPatients(ps); }).catch(() => {});
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("sw-push", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("sw-push", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const filtered = (patients ?? []).filter((p) => {
    const hay = (p.name + " " + p.phone + " " + p.service).toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Khách đang điều trị</h1>
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
      </header>

      <div className="space-y-2.5 p-4">
        {patients === null ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 size={26} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-slate-400">Không có khách phù hợp.</div>
        ) : (
          filtered.map((p) => (
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
                  {typeof p.qaScore === "number" && (
                    <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11.5px] font-bold ${
                      p.qaScore >= 90 ? "bg-emerald-50 text-emerald-600" : p.qaScore >= 75 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                    }`}>
                      <Star size={11} /> {p.qaScore}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-500">{p.service || "Chưa có liệu trình"}</div>
                <div className="mb-1 mt-2 flex items-center justify-between gap-2 text-[11.5px]">
                  {p.sessionTotal > 0 ? (
                    <span className="font-semibold text-slate-500">Buổi {p.sessionDone}/{p.sessionTotal}</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-600">Chưa có liệu trình</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    {p.zaloGroupUrl && <MessageCircle size={13} className="text-sky-500" />}
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Clock size={11} /> {fmtRelative(p.lastCareAt)}
                    </span>
                  </span>
                </div>
                {p.sessionTotal > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.round((p.sessionDone / Math.max(1, p.sessionTotal)) * 100))}%` }} />
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
