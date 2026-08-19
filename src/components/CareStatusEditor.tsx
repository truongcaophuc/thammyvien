import { useEffect, useMemo, useState } from "react";
import { chipStyle } from "../lib/chipColor";
import { Pencil, X, AlertOctagon, Check } from "lucide-react";
import { fetchCareTagOptions, setCareTag, createComplainTicket, type CareTagGroup } from "../lib/customerCare";

// đọc 1 cờ boolean trong metadata jsonb (isComplain/isIncident/…)
function metaFlag(metadata: string | null | undefined, key: string): boolean {
  if (!metadata) return false;
  try {
    return !!JSON.parse(metadata)[key];
  } catch {
    return false;
  }
}

const SEVERITIES: { key: string; label: string }[] = [
  { key: "low", label: "Nhẹ" },
  { key: "medium", label: "Vừa" },
  { key: "high", label: "Nặng" },
];

// CV-13: sửa 2 chiều trạng thái CSKH ở tầng LIỆU TRÌNH (care_status / satisfaction) cho 1 khách.
// UI: dòng tóm tắt hiện giá trị đang chọn (liếc nhanh) + bấm "Sửa" mở bottom-sheet chứa đầy đủ chip.
// (skin_level KHÔNG ở đây — nó gắn theo từng buổi, hiển thị trong "Hồ sơ điều trị".)
export default function CareStatusEditor({
  customerId,
  onChanged,
  only,
  title = "Trạng thái",
}: {
  customerId: string;
  onChanged?: () => void;
  only?: string[];    // chỉ hiện các chiều này (ĐTV chỉ đụng debt_status; CSKH bỏ trống = tất cả)
  title?: string;
}) {
  const [allGroups, setAllGroups] = useState<CareTagGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // CV-20: form ticket complain (mở khi chọn giá trị satisfaction có cờ isComplain)
  const [complainOpen, setComplainOpen] = useState(false);
  const [cIssue, setCIssue] = useState("");
  const [cSeverity, setCSeverity] = useState("medium");
  const [cWish, setCWish] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cDone, setCDone] = useState(false);

  const load = () =>
    fetchCareTagOptions(customerId)
      .then(setAllGroups)
      .catch(() => setAllGroups([]));

  useEffect(() => {
    let alive = true;
    fetchCareTagOptions(customerId)
      .then((g) => alive && setAllGroups(g))
      .catch(() => alive && setAllGroups([]));
    return () => {
      alive = false;
    };
  }, [customerId]);

  // `only` lọc ở client: careTagOptions trả sẵn mọi chiều, không cần thêm tham số BE.
  const groups = useMemo(
    () => (allGroups && only ? allGroups.filter((g) => only.includes(g.groupSlug)) : allGroups),
    [allGroups, only],
  );

  // Giá trị đang chọn của từng chiều → hàng tóm tắt (dot + chữ).
  const summary = useMemo(() => {
    return (groups ?? [])
      .map((g) => {
        const v = g.values.find((x) => x.slug === g.current);
        return v ? { key: g.groupSlug, name: v.name, color: v.color || "#94a3b8" } : null;
      })
      .filter(Boolean) as { key: string; name: string; color: string }[];
  }, [groups]);

  async function pick(g: CareTagGroup, valueSlug: string) {
    const next = g.current === valueSlug ? null : valueSlug; // bấm lại = bỏ chọn
    setBusy(g.groupSlug + valueSlug);
    setErr(null);
    // optimistic
    setAllGroups((prev) =>
      (prev ?? []).map((x) =>
        x.groupSlug === g.groupSlug
          ? { ...x, current: next, values: x.values.map((v) => ({ ...v, current: v.slug === next })) }
          : x
      )
    );
    try {
      await setCareTag(customerId, g.groupSlug, next);
      onChanged?.();
      // CV-20: vừa chọn 1 giá trị có cờ isComplain (vd "Complain") → mở form tạo ticket.
      const picked = g.values.find((v) => v.slug === next);
      if (next && metaFlag(picked?.metadata, "isComplain")) {
        setSheetOpen(false);
        setCIssue("");
        setCSeverity("medium");
        setCWish("");
        setCDone(false);
        setComplainOpen(true);
      }
    } catch (e) {
      // Trước đây nuốt lỗi im lặng: chip tự bật về cũ, người dùng tưởng "bấm lưu mà không lưu".
      setErr(e instanceof Error ? e.message : "Không lưu được trạng thái");
      await load(); // lỗi -> nạp lại trạng thái thật
    } finally {
      setBusy(null);
    }
  }

  async function submitComplain() {
    if (!cIssue.trim()) return;
    setCBusy(true);
    try {
      await createComplainTicket({ customerId, issue: cIssue.trim(), severity: cSeverity, wish: cWish.trim() || null });
      setCDone(true);
      onChanged?.();
    } catch {
      // giữ form để thử lại
    } finally {
      setCBusy(false);
    }
  }

  if (!groups) return <div className="rounded-2xl border border-slate-100 bg-white p-4 text-[13px] text-slate-400 shadow-sm">Đang tải trạng thái…</div>;
  if (!groups.length) return null;

  return (
    <>
      {/* Dòng tóm tắt: liếc thấy trạng thái + nút Sửa */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold text-slate-700">{title}</div>
          <button
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-brand-600 transition hover:bg-brand-50"
          >
            <Pencil size={13} /> Sửa
          </button>
        </div>
        {summary.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
                style={chipStyle(s.color)}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-1.5 text-[13px] text-slate-400">Chưa đặt trạng thái — bấm “Sửa” để gán.</div>
        )}
      </div>

      {/* Bottom sheet: đầy đủ chip từng chiều để chọn */}
      <div className={`fixed inset-0 z-50 ${sheetOpen ? "" : "pointer-events-none"}`} aria-hidden={!sheetOpen}>
        <div
          onClick={() => setSheetOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${sheetOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ${sheetOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-[15px] font-bold text-slate-800">Cập nhật {title.toLowerCase()}</div>
            <button onClick={() => setSheetOpen(false)} aria-label="Đóng" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-4 py-4">
            {err && (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</div>
            )}
            {groups.map((g) => (
              <div key={g.groupSlug}>
                <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{g.groupName}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.values.map((v) => {
                    const on = g.current === v.slug;
                    const c = v.color || "#94a3b8";
                    return (
                      <button
                        key={v.slug}
                        disabled={busy !== null}
                        onClick={() => pick(g, v.slug)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95 disabled:opacity-60"
                        style={chipStyle(c, on)}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c }} />
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div
            className="border-t border-slate-100 px-4 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <button onClick={() => setSheetOpen(false)} className="w-full rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]">
              Xong
            </button>
          </div>
        </div>
      </div>

      {/* CV-20: form tạo ticket complain (mở khi chọn "Complain") */}
      <div className={`fixed inset-0 z-[60] ${complainOpen ? "" : "pointer-events-none"}`} aria-hidden={!complainOpen}>
        <div
          onClick={() => setComplainOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${complainOpen ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ${complainOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
              <AlertOctagon size={17} className="text-red-500" /> Ticket complain
            </div>
            <button onClick={() => setComplainOpen(false)} aria-label="Đóng" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          {cDone ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check size={26} />
              </div>
              <div className="text-[14px] font-bold text-slate-800">Đã tạo ticket complain</div>
              <div className="mt-1 text-[12.5px] text-slate-500">Ticket đã đẩy sang Leader xử lý.</div>
            </div>
          ) : (
            <div className="max-h-[62vh] space-y-4 overflow-y-auto px-4 py-4">
              <div>
                <label className="mb-1 block text-[12px] font-bold text-slate-600">
                  Vấn đề complain <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cIssue}
                  onChange={(e) => setCIssue(e.target.value)}
                  rows={3}
                  placeholder="Khách phản ánh điều gì…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-brand-400"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-bold text-slate-600">Mức độ</div>
                <div className="flex gap-1.5">
                  {SEVERITIES.map((s) => {
                    const on = cSeverity === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setCSeverity(s.key)}
                        className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${on ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-bold text-slate-600">Mong muốn của khách</label>
                <textarea
                  value={cWish}
                  onChange={(e) => setCWish(e.target.value)}
                  rows={2}
                  placeholder="Khách mong muốn xử lý thế nào…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-brand-400"
                />
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {cDone ? (
              <button onClick={() => setComplainOpen(false)} className="w-full rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]">
                Xong
              </button>
            ) : (
              <button
                onClick={submitComplain}
                disabled={cBusy || !cIssue.trim()}
                className="w-full rounded-xl bg-red-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {cBusy ? "Đang gửi…" : "Gửi ticket"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
