import { useState, type ReactNode } from "react";
import {
  MessageCircleMore, Lightbulb, Gem, CalendarCheck,
  Sparkles, Loader2,
  ChevronDown, RefreshCw,
} from "lucide-react";
import type { Lead } from "../data";
import Sheet from "../components/Sheet";
import { generateCallScript, callScriptCache, type AiCallScript } from "../lib/callScript";

const icons = [MessageCircleMore, Lightbulb, Gem, CalendarCheck];
const tints = [
  "bg-brand-100 text-brand-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-sky-100 text-sky-600",
];

// Giá tiền / phần trăm / mốc thời gian — auto highlight để telesale liếc thấy ngay
// con số quan trọng, kể cả khi AI chưa đánh dấu cụm từ khoá.
const NUM_RE = /(\d[\d.,]*\s*(?:triệu|tr|nghìn|ngàn|k|đồng|đ|vn[đd]|%|giờ|phút|buổi|lần|ngày|tuần|tháng)\b)/gi;

function highlightNumbers(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(NUM_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <mark key={`${keyPrefix}-n${i++}`} className="rounded bg-amber-100 px-0.5 font-semibold text-amber-700">
        {m[0]}
      </mark>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Render lời thoại có highlight keyword:
//  - **cụm**  → AI đánh dấu (tên dịch vụ / ưu đãi / câu chốt) → nền brand
//  - số tiền / % / thời gian → auto nền amber
function renderScriptBody(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, idx) => {
    const marked = /^\*\*([^*]+)\*\*$/.exec(part);
    if (marked) {
      nodes.push(
        <mark key={`b${idx}`} className="rounded bg-brand-100 px-1 font-semibold text-brand-700">
          {marked[1]}
        </mark>,
      );
    } else if (part) {
      nodes.push(...highlightNumbers(part, `t${idx}`));
    }
  });
  return nodes;
}

export default function CallScriptSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
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
                      <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-600">{renderScriptBody(step.body)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

      </div>
    </Sheet>
  );
}
