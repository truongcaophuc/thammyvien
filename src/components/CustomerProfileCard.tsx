import { useEffect, useState } from "react";
import { ChevronDown, Loader2, UserRound } from "lucide-react";
import { fetchLeadProfile, type LeadProfile } from "../lib/leads";

// Hồ sơ khách do Telesale nhập (cơ bản + thuộc tính DynamicForm) — DÙNG CHUNG cho ĐTV & CSKH.
// leadProfile nhận Customer.Id nên khách điều trị dùng thẳng patient.id, không cần query riêng.
// Gập lại mặc định + chỉ tải khi mở lần đầu: 2 màn chi tiết đã rất dài, không nên nạp thêm.
export default function CustomerProfileCard({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<LeadProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetchLeadProfile(customerId)
      .then((p) => { if (!cancelled) { setProfile(p); setLoaded(true); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, loaded, customerId]);

  const rows: [string, string][] = profile
    ? ([
        ["Điện thoại", profile.phone],
        ["Điện thoại 2", profile.phone2],
        ["Ngày sinh", profile.dob],
        ["Email", profile.email],
        ["Địa chỉ", profile.address],
        ["Nghề nghiệp", profile.job],
        ...profile.attributes.map((a): [string, string] => [a.label, a.value]),
      ] as [string, string][]).filter(([, v]) => !!v)
    : [];

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-[14px] font-bold text-slate-800"
      >
        <UserRound size={17} className="text-brand-600" /> Thông tin khách
        {open && !loaded && <Loader2 size={14} className="animate-spin text-slate-400" />}
        <ChevronDown size={17} className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 divide-y divide-slate-100">
          {rows.length === 0 && loaded ? (
            <div className="py-4 text-center text-[13px] text-slate-400">Chưa có thông tin từ Telesale</div>
          ) : (
            rows.map(([k, v], i) => (
              <div key={`${k}-${i}`} className="flex items-start justify-between gap-3 py-2.5">
                <span className="shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
                <span className="min-w-0 text-right text-[13.5px] leading-snug text-slate-700">{v}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
