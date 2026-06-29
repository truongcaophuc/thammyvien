import { useEffect, useState } from "react";
import {
  MessageCircleMore, Lightbulb, Gem, CalendarCheck,
  BookOpen, Sparkles, Loader2, Tag,
  ChevronDown, RefreshCw,
} from "lucide-react";
import type { Lead } from "../data";
import Sheet from "../components/Sheet";
import { fetchCallScript, generateCallScript, formatPriceRange, callScriptCache, type CallScriptHit, type AiCallScript } from "../lib/callScript";

const icons = [MessageCircleMore, Lightbulb, Gem, CalendarCheck];
const tints = [
  "bg-brand-100 text-brand-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-sky-100 text-sky-600",
];

export default function CallScriptSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  // ===== KB tham khảo (auto-load, ẩn trong accordion) =====
  const [hits, setHits] = useState<CallScriptHit[] | null>(() => callScriptCache.getKb(lead.id));
  const [kbErr, setKbErr] = useState<string | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbExpanded, setKbExpanded] = useState<Set<number>>(new Set());
  const toggleKb = (i: number) => setKbExpanded((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  useEffect(() => {
    if (callScriptCache.getKb(lead.id)) return; // đã có cache → khỏi fetch
    const q = (lead.need || lead.note || "").trim();
    if (!q) { setHits([]); return; }
    let cancelled = false;
    setHits(null); setKbErr(null);
    fetchCallScript(q)
      .then((h) => { if (!cancelled) { setHits(h); callScriptCache.setKb(lead.id, h); } })
      .catch((e) => { if (!cancelled) setKbErr(e instanceof Error ? e.message : "Không tải được gợi ý"); });
    return () => { cancelled = true; };
  }, [lead.id, lead.need, lead.note]);

  // ===== Kịch bản AI (LLM) =====
  const [ai, setAi] = useState<AiCallScript | null>(() => callScriptCache.getScript(lead.id));
  const [aiLoading, setAiLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  function customerContext(): string {
    switch (lead.status) {
      case "callback": return "Khách đã được gọi trước đó và hẹn gọi lại — đây là cuộc gọi tiếp theo, chưa từng đến viện.";
      case "scheduled": return "Khách đã đặt lịch hẹn đến viện nhưng CHƯA đến — gọi để xác nhận/nhắc lịch.";
      case "overdue": return "Lead để lại thông tin đã lâu nhưng chưa gọi được — gọi ra lần đầu, khách chưa từng đến viện.";
      default: return "Khách MỚI vừa để lại thông tin quan tâm trên fanpage/website — gọi ra LẦN ĐẦU, khách CHƯA từng đến hay điều trị tại viện.";
    }
  }

  async function runAi() {
    const q = (lead.need || lead.note || "").trim();
    if (!q || aiLoading) return;
    setAiLoading(true); setAi(null); setCollapsed(new Set());
    try {
      const res = await generateCallScript(q, lead.name, customerContext());
      setAi(res);
      if (res.steps.length > 0) callScriptCache.setScript(lead.id, res); // chỉ cache khi thành công
    } catch (e) {
      setAi({ steps: [], sources: [], error: e instanceof Error ? e.message : "Lỗi tạo kịch bản" });
    } finally {
      setAiLoading(false);
    }
  }

  function toggleStep(i: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <Sheet title="Kịch bản gọi" onClose={onClose}>
      <div className="space-y-3 px-4 pb-2">


        {/* CTA — khi chưa có kịch bản */}
        {!ai && !aiLoading && (
          <div className="pt-2">
            <button
              onClick={runAi}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 py-3.5 text-[15px] font-bold text-white shadow-soft transition-transform active:scale-[0.98]"
            >
              <Sparkles size={18} /> Tạo kịch bản gọi
            </button>
          </div>
        )}

        {/* Loading */}
        {aiLoading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-white py-8 text-[13px] text-slate-500">
            <Loader2 size={18} className="animate-spin text-brand-500" /> Đang soạn kịch bản theo nhu cầu khách…
          </div>
        )}

        {/* Lỗi */}
        {ai?.error && (
          <div className="rounded-xl bg-rose-50 p-3 text-center text-[12.5px] text-rose-600">{ai.error}</div>
        )}

        {/* ===== KỊCH BẢN (hero) ===== */}
        {ai && ai.steps.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-brand-500">
                <Sparkles size={13} /> Kịch bản gọi
              </span>
              <button
                onClick={runAi}
                disabled={aiLoading}
                className="flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw size={12} /> Tạo lại
              </button>
            </div>

            {ai.steps.map((step, i) => {
              const Icon = icons[i % icons.length];
              const open = !collapsed.has(i);
              return (
                <div key={`ai-${i}`} className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
                  <button
                    onClick={() => toggleStep(i)}
                    className="flex w-full cursor-pointer items-center gap-2 p-3.5 text-left"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tints[i % tints.length]}`}>
                      <Icon size={17} />
                    </span>
                    <span className="flex-1 text-[14.5px] font-bold text-slate-800">{i + 1}. {step.title}</span>
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>

                  {open && (
                    <div className="px-3.5 pb-3.5">
                      <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-600">{step.body}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Tách vùng "tham khảo" khỏi vùng "hành động" để đỡ bấm nhầm */}
        <div className="flex items-center gap-2 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-slate-300">
          <span className="h-px flex-1 bg-slate-200" /> Tham khảo <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* ===== Tài liệu tham khảo KB (accordion) ===== */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <button
            onClick={() => setKbOpen((o) => !o)}
            className="flex w-full cursor-pointer items-center gap-2 p-3 text-left"
          >
            <BookOpen size={15} className="shrink-0 text-slate-400" />
            <span className="flex-1 text-[13px] font-semibold text-slate-600">
              Tài liệu tham khảo (KB){hits ? ` · ${hits.length}` : ""}
            </span>
            <ChevronDown size={17} className={`shrink-0 text-slate-400 transition-transform ${kbOpen ? "rotate-180" : ""}`} />
          </button>

          {kbOpen && (
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-3">
              {hits === null && !kbErr && (
                <div className="flex items-center justify-center gap-2 py-3 text-[12.5px] text-slate-400">
                  <Loader2 size={15} className="animate-spin" /> Đang tải…
                </div>
              )}
              {kbErr && <div className="rounded-xl bg-rose-50 p-3 text-center text-[12.5px] text-rose-600">{kbErr}</div>}
              {hits && hits.length === 0 && !kbErr && (
                <div className="py-2 text-center text-[12.5px] text-slate-400">Không có tài liệu phù hợp.</div>
              )}
              {hits?.map((h, i) => {
                const price = formatPriceRange(h.priceFromVnd, h.priceToVnd);
                const open = kbExpanded.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleKb(i)}
                    className="w-full cursor-pointer rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-bold text-slate-800">{h.title || h.headingPath}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {price && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <Tag size={11} /> {price}
                          </span>
                        )}
                        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    <p className={`mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-500 ${open ? "" : "line-clamp-3"}`}>
                      {h.chunkText}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
