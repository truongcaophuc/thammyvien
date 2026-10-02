import { useEffect, useMemo, useState } from "react";
import { FileAudio, Loader2, MessageSquareText, Search, StickyNote } from "lucide-react";
import { Badge } from "../../components/common";
import { fetchConsultantCalls } from "../../lib/leads";
import type { ConsultantCall } from "../../data";

export default function ConsultantCalls() {
  const [calls, setCalls] = useState<ConsultantCall[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setErr("");
    fetchConsultantCalls()
      .then((items) => {
        if (!cancelled) setCalls(items);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Không tải được danh sách cuộc gọi");
          setCalls([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return calls ?? [];
    const phoneTerm = term.replace(/[^0-9+]/g, "");
    return (calls ?? []).filter((c) => {
      const hay = `${c.leadName} ${c.need} ${c.source} ${c.result} ${c.notes}`.toLowerCase();
      const phone = c.phone.replace(/[^0-9+]/g, "");
      return hay.includes(term) || (!!phoneTerm && phone.includes(phoneTerm));
    });
  }, [calls, q]);

  const withRecording = (calls ?? []).filter((c) => !!c.recordingUrl).length;
  const withNotes = (calls ?? []).filter((c) => !!c.notes.trim()).length;

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-10 bg-[#eef0f5]/95 px-4 pb-3 pt-4 backdrop-blur">
        <h2 className="text-[18px] font-extrabold text-slate-800">Tư vấn viên</h2>
        <div className="mt-1 text-[12.5px] text-slate-500">
          File ghi âm và ghi chú của từng cuộc gọi
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Cuộc gọi" value={calls?.length ?? 0} tone="brand" />
          <Stat label="Có ghi âm" value={withRecording} tone="emerald" />
          <Stat label="Có ghi chú" value={withNotes} tone="amber" />
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-card">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm khách, SĐT, ghi chú..."
            className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {calls === null && (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            Đang tải cuộc gọi...
          </div>
        )}

        {err && (
          <div className="rounded-2xl bg-rose-50 p-4 text-center text-[13px] text-rose-600 shadow-card">
            {err}
          </div>
        )}

        {calls !== null && !err && filtered.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-[13px] text-slate-400 shadow-card">
            {q.trim() ? "Không tìm thấy cuộc gọi phù hợp" : "Chưa có cuộc gọi nào"}
          </div>
        )}

        {filtered.map((call) => (
          <CallCard key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "emerald" | "amber";
}) {
  const cls = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-2 text-center shadow-card ${cls}`}>
      <div className="text-[18px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-[10.5px] font-semibold">{label}</div>
    </div>
  );
}

function CallCard({ call }: { call: ConsultantCall }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <MessageSquareText size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold text-slate-800">{call.leadName}</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-slate-500">
                {call.phone} · {call.calledAt}
              </div>
            </div>
            <Badge tone="slate" className="shrink-0">{call.result}</Badge>
          </div>

          {call.need || call.source ? (
            <div className="mt-2 text-[12.5px] text-slate-500">
              {[call.need, call.source].filter(Boolean).join(" · ")}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              <StickyNote size={13} />
              Ghi chú
            </div>
            <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">
              {call.notes.trim() || "Chưa có ghi chú"}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              <FileAudio size={13} />
              Ghi âm
            </div>
            {call.recordingUrl ? (
              <div className="rounded-xl border border-slate-100 bg-white p-2.5">
                <div className="mb-2 truncate text-[12px] font-semibold text-slate-500">
                  {call.recordingFileName || "File ghi âm cuộc gọi"}
                </div>
                <audio src={call.recordingUrl} controls preload="metadata" className="w-full" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[13px] text-slate-400">
                Cuộc gọi này chưa có file ghi âm
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
