import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "Chọn",
  disabled,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label || placeholder;

  return (
    <div
      className={`relative ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-[14px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200 text-slate-700 hover:border-brand-200"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-slate-800" : "text-slate-500"}`}>{shown}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div className="no-scrollbar absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          {options.map((o) => {
            const on = value === o.value;
            return (
              <button
                key={o.value || "__empty__"}
                type="button"
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`mt-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  on ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {on && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
