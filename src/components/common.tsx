import type { LeadStatus } from "../data";

/** Màu sắc & nhãn theo trạng thái lead */
export const statusMeta: Record<
  LeadStatus,
  { label: string; cls: string; dot: string }
> = {
  new: { label: "Mới", cls: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  overdue: { label: "Quá hạn", cls: "bg-rose-100 text-rose-600", dot: "bg-rose-500" },
  callback: { label: "Gọi lại", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  scheduled: { label: "Đã đặt lịch", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  closed: { label: "Đã đóng", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-500" },
};

export function Badge({
  children,
  tone = "brand",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "brand" | "rose" | "amber" | "emerald" | "sky" | "slate";
  className?: string;
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-100 text-brand-700",
    rose: "bg-rose-100 text-rose-600",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    sky: "bg-sky-100 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = Math.min(100, Math.round((value / total) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  action,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
        {icon}
        {children}
      </h3>
      {action}
    </div>
  );
}

/** Avatar tròn từ tên (lấy chữ cái đầu) */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 font-bold text-white shadow-soft"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}
