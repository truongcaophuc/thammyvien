import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => ""),
    ...Array.from({ length: count }, (_, i) => toYmd(new Date(year, month, i + 1))),
  ];
}

function formatDateLabel(value: string) {
  if (!value) return "Chọn ngày";
  const d = parseYmd(value);
  const day = d.getDay() === 0 ? "CN" : `Thứ ${d.getDay() + 1}`;
  return `${day}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function DatePickerButton({
  value,
  placeholder = "Chọn ngày",
  onClick,
  className = "",
}: {
  value: string;
  placeholder?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border-2 border-slate-100 px-3 py-1.5 text-left text-[14px] font-semibold text-slate-700 outline-none transition-colors hover:border-brand-200 focus:border-brand-300 ${className}`}
    >
      <span className="min-w-0 truncate">{value ? formatDateLabel(value) : placeholder}</span>
      <CalendarDays size={16} className="ml-2 shrink-0 text-slate-500" />
    </button>
  );
}

export default function DatePickerSheet({
  value,
  min,
  title = "Chọn ngày",
  onChange,
  onClose,
}: {
  value: string;
  min?: string;
  title?: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const fallback = value || min || toYmd(new Date());
  const initial = parseYmd(fallback);
  const [draft, setDraft] = useState(fallback);
  const [month, setMonth] = useState(() => ({ year: initial.getFullYear(), index: initial.getMonth() }));
  const today = toYmd(new Date());
  const minDate = min ? parseYmd(min) : null;
  const quickDates = [0, 1, 2, 3, 4].map((days) => {
    const d = addDays(new Date(), days);
    return {
      value: toYmd(d),
      label: days === 0 ? "Hôm nay" : days === 1 ? "Mai" : `T.${d.getDay() === 0 ? "CN" : d.getDay() + 1}`,
      date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    };
  });

  function moveMonth(delta: number) {
    setMonth((prev) => {
      const d = new Date(prev.year, prev.index + delta, 1);
      return { year: d.getFullYear(), index: d.getMonth() };
    });
  }

  function disabled(date: string) {
    return !!minDate && parseYmd(date) < minDate;
  }

  function pick(date: string) {
    if (disabled(date)) return;
    setDraft(date);
    const d = parseYmd(date);
    setMonth({ year: d.getFullYear(), index: d.getMonth() });
  }

  function done() {
    onChange(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-950/35" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-800">{title}</div>
          <button onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {quickDates.map((d) => {
              const on = draft === d.value;
              const off = disabled(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={off}
                  onClick={() => pick(d.value)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition active:scale-95 disabled:opacity-35 ${
                    on ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className={`text-[12px] font-bold ${on ? "text-brand-600" : "text-slate-500"}`}>{d.label}</div>
                  <div className="text-[13px] font-semibold text-slate-800">{d.date}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-100 p-3">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="Tháng trước"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-[14px] font-extrabold text-slate-800">
                Tháng {month.index + 1}/{month.year}
              </div>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="Tháng sau"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
              {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthDays(month.year, month.index).map((date, index) => {
                if (!date) return <div key={`empty-${index}`} className="h-9" />;
                const d = parseYmd(date);
                const on = draft === date;
                const isToday = today === date;
                const off = disabled(date);
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={off}
                    onClick={() => pick(date)}
                    className={`flex h-9 items-center justify-center rounded-full text-[13px] font-bold transition active:scale-95 disabled:text-slate-300 ${
                      on
                        ? "bg-violet-600 text-white"
                        : isToday
                          ? "bg-violet-50 text-violet-700"
                          : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="shrink-0 border-t border-slate-100 px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mb-2 text-center text-[13px] font-bold text-slate-700">{formatDateLabel(draft)}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 py-2.5 text-[14px] font-bold text-slate-600 transition active:scale-[0.98]"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={done}
              className="rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
