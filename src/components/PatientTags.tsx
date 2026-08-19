// Chip phân loại KH + trạng thái chốt/thanh toán — dùng chung cho Tổng quan và danh sách khách.
import type { Patient } from "../lib/technician";

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

/** Chip phân loại KH (tag customer_tier: KH mới / KH cũ / KH VIP). Màu lấy từ tag. */
export function TierChip({ p }: { p: Patient }) {
  if (!p.tierName) return null;
  const c = p.tierColor || "#64748b";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold"
      style={{ color: c, background: `${c}1a` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
      {p.tierName}
    </span>
  );
}

/**
 * Chip chốt gói + công nợ. Ẩn hẳn khi khách chưa có gói (chưa đánh giá & chưa có giá)
 * để danh sách không đầy chip vô nghĩa.
 */
/**
 * Chip trạng thái thanh toán — lấy từ tag `debt_status` Trợ lý gán tay, KHÔNG suy từ số tiền.
 * Chưa gắn tag thì không hiện gì (trừ khi hồ sơ đang "Chưa chốt").
 */
export function PaymentChip({ p }: { p: Patient }) {
  if (p.dealStatus === "open") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
        Chưa chốt
      </span>
    );
  }
  if (!p.debtTagName) return null;
  const c = p.debtTagColor || "#64748b";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold"
      style={{ color: c, background: `${c}1a` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
      {p.debtTagName}
    </span>
  );
}

/** VIP lên đầu, rồi hồ sơ vừa cập nhật, rồi ngày tới khám gần nhất — khớp ORDER BY của backend. */
export function sortPatients(list: Patient[]): Patient[] {
  const t = (s?: string | null) => (s ? new Date(s).getTime() || 0 : 0);
  return [...list].sort((a, b) => {
    const vip = Number(b.tierSlug === "vip") - Number(a.tierSlug === "vip");
    if (vip) return vip;
    const upd = t(b.lastUpdatedAt) - t(a.lastUpdatedAt);
    if (upd) return upd;
    const na = t(a.nextAppointmentAt) || Infinity;
    const nb = t(b.nextAppointmentAt) || Infinity;
    return na - nb;
  });
}
