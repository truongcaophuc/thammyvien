import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, Search } from "lucide-react";
import type { Lead, LeadStatus } from "../data";
import { Badge } from "../components/common";
import { Skeleton } from "../components/Skeleton";
import { fetchMyLeads } from "../lib/leads";

export type FilterKey = "to_call" | "overdue" | "callback" | "scheduled" | "closed";

const filters: { key: FilterKey; label: string; match: LeadStatus[] }[] = [
  { key: "to_call", label: "Cần gọi", match: ["new"] },
  { key: "overdue", label: "Quá hạn", match: ["overdue"] },
  { key: "callback", label: "Gọi lại", match: ["callback"] },
  { key: "scheduled", label: "Đã đặt lịch", match: ["scheduled"] },
  { key: "closed", label: "Đã đóng", match: ["closed"] },
];

function badgeTone(l: Lead) {
  switch (l.status) {
    case "overdue":
      return "rose" as const;
    case "callback":
      return "amber" as const;
    case "scheduled":
      return "emerald" as const;
    case "new":
      return "sky" as const;
    case "closed":
      return "slate" as const;
    default:
      return "brand" as const;
  }
}

export default function CallList({
  onOpenLead,
  initialFilter = "to_call",
}: {
  onOpenLead: (l: Lead) => void;
  initialFilter?: FilterKey;
}) {
  const [active, setActive] = useState<FilterKey>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Refs cho scroll chip active vào viewport khi list dài hơn screen.
  const chipsScrollRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const data = await fetchMyLeads();
        if (!cancelled) setAllLeads(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Không tải được danh sách");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll chip active vào giữa viewport khi user tap chip ở rìa phải.
  useEffect(() => {
    const chip = chipRefs.current[active];
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { to_call: 0, overdue: 0, callback: 0, scheduled: 0, closed: 0 };
    for (const f of filters) c[f.key] = allLeads.filter((l) => f.match.includes(l.status)).length;
    return c;
  }, [allLeads]);

  const list = useMemo(() => {
    const f = filters.find((x) => x.key === active)!;
    const byStatus = allLeads.filter((l) => f.match.includes(l.status));
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byStatus;
    // Strip non-digit/non-+ trong query để match phone format có space/dash.
    const qPhone = q.replace(/[^0-9+]/g, "");
    return byStatus.filter((l) => {
      const nameMatch = l.name.toLowerCase().includes(q);
      const phoneMatch = qPhone.length > 0
        && l.phone.replace(/[^0-9+]/g, "").includes(qPhone);
      return nameMatch || phoneMatch;
    });
  }, [active, allLeads, searchQuery]);

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#eef0f5]/95 px-4 pb-2 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold text-slate-800">Danh sách gọi</h2>
          {/* <Badge tone="slate">{allLeads.length} lead</Badge> */}
        </div>

        {/* Ô tìm kiếm — filter theo tên (substring) hoặc phone (chỉ digit) */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-card">
          <Search size={17} className="text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc số điện thoại"
            className="w-full bg-transparent text-[14px] text-slate-700 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Xoá tìm kiếm"
              className="cursor-pointer text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter chips — horizontal scroll khi overflow.
            scroll-smooth + snap-x + snap-mandatory để vuốt từng chip mượt mà.
            Fade gradient bên phải hint user còn chip ẩn (chỉ show khi overflow). */}
        <div className="relative mt-3">
          <div
            ref={chipsScrollRef}
            className="no-scrollbar flex snap-x snap-mandatory scroll-px-1 gap-2 overflow-x-auto scroll-smooth pr-6"
          >
            {filters.map((f) => {
              const on = active === f.key;
              return (
                <button
                  key={f.key}
                  ref={(el) => { chipRefs.current[f.key] = el; }}
                  onClick={() => setActive(f.key)}
                  className={`flex shrink-0 snap-center cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    on
                      ? "bg-brand-600 text-white shadow-soft"
                      : "bg-white text-slate-600 shadow-card"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[11px] ${
                      on ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Right fade — hint còn chip phía sau. pointer-events-none để không cản tap. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#eef0f5] to-transparent" />
        </div>
      </div>

      {/* Danh sách lead */}
      <div className="space-y-3 px-4 pt-3">
        {loading &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-28" />
                <div className="mt-2 flex items-center gap-2">
                  <Skeleton className="h-4 w-12 rounded-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            </div>
          ))}
        {err && !loading && (
          <div className="rounded-2xl bg-rose-50 p-4 text-center text-[13px] text-rose-600 shadow-card">
            {err}
          </div>
        )}
        {!loading && !err && list.map((l) => (
          // Card row: text area mở lead detail, icon Phone là <a tel:> riêng.
          // Không nest <a> trong <button> (HTML invalid) — dùng 2 element cùng cấp.
          <div
            key={l.id}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card transition-shadow hover:shadow-soft"
          >
            <button
              onClick={() => onOpenLead(l)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-bold text-slate-800">{l.name}</span>
              </div>
              <div className="mt-0.5 text-[13px] font-medium text-slate-500">{l.phone}</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={badgeTone(l)}>{l.badge}</Badge>
                <span className="truncate text-[12px] text-slate-400">{l.source}</span>
              </div>
            </button>
            <a
              href={`tel:${l.phone.replace(/[^0-9+]/g, "")}`}
              aria-label={`Gọi ${l.name}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition-transform active:scale-95"
            >
              <Phone size={18} />
            </a>
          </div>
        ))}
        {!loading && !err && list.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-[13px] text-slate-400 shadow-card">
            Không có lead trong nhóm này
          </div>
        )}
      </div>
    </div>
  );
}
