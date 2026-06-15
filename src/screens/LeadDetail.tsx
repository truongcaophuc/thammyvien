import { useState } from "react";
import {
  ChevronLeft,
  Phone,
  FileText,
  Target,
  StickyNote,
  Clock,
  PhoneMissed,
  CheckCircle2,
  History,
  CalendarDays,
  MapPin,
  Clock3,
  Save,
  Pencil,
  Loader2,
} from "lucide-react";
import type { DayOption, Lead, ResultKey, Slot } from "../data";
import { statusMeta } from "../components/common";
import { saveCallResult } from "../lib/callResult";

// TODO: migrate sang BE — resultOptions từ CallResult table; bookingDays/timeSlots/branchName
// từ chi nhánh + slot availability của user. Hiện hardcode để demo flow.
const resultOptions: { key: ResultKey; label: string }[] = [
  { key: "WRONG_NUMBER", label: "Sai số" },
  { key: "REJECTED", label: "Không quan tâm / từ chối" },
  { key: "CALLBACK", label: "Gọi lại sau" },
  { key: "BOOKED", label: "Đặt lịch hẹn thành công" },
];

// Sinh 4 ngày booking từ TODAY → TODAY+3. Label "Hôm nay"/"Mai"/weekday short.
// Module-level: nếu user mở app qua đêm thì labels lệch — accept edge case cho MVP.
const WEEKDAYS_SHORT_VI = ["CN", "T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy"];
function buildBookingDays(): DayOption[] {
  const out: DayOption[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const label = i === 0 ? "Hôm nay" : i === 1 ? "Mai" : WEEKDAYS_SHORT_VI[d.getDay()];
    out.push({ key: `d${i}`, label, date: `${dd}/${mm}` });
  }
  return out;
}
const bookingDays: DayOption[] = buildBookingDays();

const timeSlots: Slot[] = [
  { time: "09:00", booked: 0 },
  { time: "10:00", booked: 1 },
  { time: "11:00", booked: 0 },
  { time: "14:00", booked: 1 },
  { time: "15:00", booked: 2 },
  { time: "16:00", booked: 1 },
  { time: "17:00", booked: 0 },
];

const branchName = "CS Quận Bình Thạnh";

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="mt-0.5 text-[14px] leading-snug text-slate-700">{value}</div>
      </div>
    </div>
  );
}

export default function LeadDetail({
  lead,
  onBack,
  onScript,
  onSaved,
}: {
  lead: Lead;
  onBack: () => void;
  onScript: () => void;
  onSaved: (msg: string) => void;
}) {
  const meta = statusMeta[lead.status];
  // Lead ở trạng thái cuối (closed = đã đóng, scheduled = đã đặt lịch):
  // chỉ cho phép bổ sung ghi chú, ẩn radio kết quả + booking UI.
  // Workflow đã settled — agent không cần "cập nhật kết quả" nữa.
  const isFinalState = lead.status === "closed" || lead.status === "scheduled";

  const [result, setResult] = useState<ResultKey | null>(null);
  const [day, setDay] = useState(bookingDays[1].key);
  const [slot, setSlot] = useState<string | null>("10:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const showBooking = result === "BOOKED";
  const selectedDay = bookingDays.find((d) => d.key === day)!;

  // P2 — discard confirmation: cảnh báo khi user back với data đang nhập.
  const handleBack = () => {
    const hasUnsavedData = !!result || notes.trim().length > 0;
    if (hasUnsavedData) {
      const ok = window.confirm("Bạn đang nhập dở kết quả cuộc gọi. Bỏ và quay lại?");
      if (!ok) return;
    }
    onBack();
  };

  const save = async () => {
    if (saving) return;
    // Final state: cho phép save khi user chỉ ghi notes (không cần chọn result).
    // BE map fallback result theo current status, không đổi Customer.Status thực tế.
    if (!isFinalState && !result) return;
    if (isFinalState && !notes.trim()) return; // không có gì để save

    setSaving(true);
    const noteSuffix = notes.trim() ? ` — "${notes.trim().slice(0, 40)}${notes.trim().length > 40 ? "…" : ""}"` : "";

    try {
      // Effective result gửi lên BE.
      // - Non-final: dùng radio user chọn
      // - Final closed: gửi REJECTED (BE map → CLOSED, status đã CLOSED rồi nên no-op)
      // - Final scheduled: gửi BOOKED không kèm appointmentDate (BE skip insert Appointment,
      //   Customer.Status đã SCHEDULED nên no-op). Mục đích chỉ insert ContactCall log notes.
      const effectiveResult: ResultKey = isFinalState
        ? lead.status === "closed" ? "REJECTED" : "BOOKED"
        : result!;

      // Parse appointment date từ day+slot khi BOOKED. Final-scheduled bỏ qua (chỉ ghi note).
      let appointmentDate: string | undefined;
      if (!isFinalState && showBooking && slot) {
        const [dd, mm] = selectedDay.date.split("/").map(Number);
        const [hh, mi] = slot.split(":").map(Number);
        const now = new Date();
        const dt = new Date(now.getFullYear(), mm - 1, dd, hh, mi, 0, 0);
        appointmentDate = dt.toISOString();
      }

      const res = await saveCallResult({
        leadId: lead.id,
        result: effectiveResult,
        notes: notes.trim() || undefined,
        appointmentDate,
      });

      if (!res.success) throw new Error("BE trả success=false");

      if (isFinalState) {
        onSaved(`Đã cập nhật ghi chú cho ${lead.name}`);
      } else if (showBooking) {
        onSaved(`Đã đặt lịch ${lead.name} · ${selectedDay.date} ${slot} tại ${branchName}${noteSuffix}`);
      } else {
        const label = resultOptions.find((r) => r.key === result)!.label;
        onSaved(`Đã lưu kết quả: ${label}${noteSuffix}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không lưu được kết quả";
      onSaved(`⚠ Lỗi: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled = saving
    || (isFinalState ? !notes.trim() : !result || (showBooking && !slot));

  return (
    <div className="min-h-full pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-card backdrop-blur">
        <button
          onClick={handleBack}
          aria-label="Quay lại"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="flex-1 text-center text-[15px] font-bold text-slate-800">Chi tiết lead</span>
        {/* Status ở góc phải — Option A: dot màu 8px + text slate neutral.
            Semantic màu giữ ở dot, text/UI hòa với brand purple chủ đạo của app.
            statusMeta.dot có sẵn (bg-{tone}-500) ở common.tsx. */}
        <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-600">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {/* === SECTION 1: TÊN + SĐT — primary identity + call action === */}
        <div className="rounded-2xl2 bg-white p-5 shadow-card">
          <h1 className="text-[22px] font-extrabold leading-tight text-slate-900">{lead.name}</h1>
          {/* P3 — SĐT là plain text (không tap-to-call), chỉ button "Gọi ngay" mới gọi.
              Tránh ambiguous "tap chỗ nào để dial". */}
          <div className="mt-1 text-[17px] font-bold text-brand-600">{lead.phone}</div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-3 text-[14.5px] font-bold text-white shadow-soft transition-transform active:scale-[0.98]"
            >
              <Phone size={18} /> Gọi ngay
            </a>
            <button
              onClick={onScript}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-50 py-3 text-[14.5px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <FileText size={18} /> Kịch bản gọi
            </button>
          </div>
        </div>

        {/* Thông tin từ trang */}
        <div className="rounded-2xl2 bg-white px-4 py-1 shadow-card">
          <div className="border-b border-slate-100 py-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
            Thông tin từ trang
          </div>
          <div className="divide-y divide-slate-100">
            <InfoRow icon={<Target size={16} />} label="Nhu cầu" value={lead.need} />
            <InfoRow icon={<StickyNote size={16} />} label="Ghi chú" value={lead.note} />
            <InfoRow icon={<Clock size={16} />} label="Nhận lúc" value={lead.receivedAt} />
          </div>
        </div>

        {/* Lịch sử gọi */}
        <div className="rounded-2xl2 bg-white px-4 py-1 shadow-card">
          <div className="flex items-center gap-2 border-b border-slate-100 py-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
            <History size={15} /> Lịch sử gọi
          </div>
          {lead.history.length === 0 ? (
            <div className="py-5 text-center text-[13px] text-slate-400">Chưa có cuộc gọi nào</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lead.history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      h.tone === "success"
                        ? "bg-emerald-100 text-emerald-600"
                        : h.tone === "warning"
                        ? "bg-rose-100 text-rose-500"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {h.tone === "success" ? (
                      <CheckCircle2 size={16} />
                    ) : h.tone === "warning" ? (
                      <PhoneMissed size={16} />
                    ) : (
                      <Phone size={16} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-slate-700">{h.result}</div>
                    <div className="text-[12px] text-slate-400">{h.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cập nhật kết quả cuộc gọi — card neutral, không viền tím.
            Final state (closed/scheduled): ẩn radio + booking, chỉ show notes textarea
            (textarea đã có label "GHI CHÚ" riêng nên không cần card title). */}
        <div className="rounded-2xl2 bg-white p-4 shadow-card">
          {!isFinalState && (
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              Cập nhật kết quả cuộc gọi
            </div>
          )}

          {!isFinalState && (
          <div className="space-y-2">
            {resultOptions.map((opt) => {
              const on = result === opt.key;
              const success = opt.key === "BOOKED";
              return (
                <button
                  key={opt.key}
                  onClick={() => setResult(opt.key)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-left transition-colors ${
                    on
                      ? success
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-brand-500 bg-brand-50"
                      : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      on
                        ? success
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-brand-500 bg-brand-500"
                        : "border-slate-300"
                    }`}
                  >
                    {on && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span
                    className={`flex-1 text-[14.5px] font-semibold ${
                      on ? (success ? "text-emerald-700" : "text-brand-700") : "text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {on && success && <CheckCircle2 size={20} className="text-emerald-500" />}
                </button>
              );
            })}
          </div>
          )}

          {/* Đặt lịch hẹn — collapsible khi chọn BOOKED */}
          {!isFinalState && showBooking && (
            <div className="mt-4 space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
              <div className="flex items-center gap-2 text-[14.5px] font-bold text-slate-800">
                <CalendarDays size={18} className="text-emerald-600" /> Đặt lịch hẹn tại cơ sở
              </div>

              {/* Chọn ngày */}
              <div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  Chọn ngày hẹn
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {bookingDays.map((d) => {
                    const on = day === d.key;
                    return (
                      <button
                        key={d.key}
                        onClick={() => setDay(d.key)}
                        className={`cursor-pointer rounded-xl border-2 py-2 text-center transition-colors ${
                          on
                            ? "border-brand-500 bg-brand-50"
                            : "border-slate-100 hover:border-slate-200"
                        }`}
                      >
                        <div
                          className={`text-[12px] font-semibold ${
                            on ? "text-brand-600" : "text-slate-500"
                          }`}
                        >
                          {d.label}
                        </div>
                        <div
                          className={`text-[14px] font-extrabold ${
                            on ? "text-brand-700" : "text-slate-700"
                          }`}
                        >
                          {d.date}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thông tin cơ sở */}
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
                <MapPin size={15} className="mt-0.5 shrink-0 text-rose-500" />
                <span>
                  <b className="text-slate-700">{branchName}</b> — ngày {selectedDay.date} đã có{" "}
                  <b className="text-slate-700">5</b> cuộc hẹn
                </span>
              </div>

              {/* Chọn giờ */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  <Clock3 size={13} /> Chọn giờ hẹn
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((s) => {
                    const on = slot === s.time;
                    const free = s.booked === 0;
                    return (
                      <button
                        key={s.time}
                        onClick={() => setSlot(s.time)}
                        className={`cursor-pointer rounded-xl border-2 py-2 text-center transition-colors ${
                          on
                            ? "border-brand-500 bg-brand-600 text-white shadow-soft"
                            : "border-slate-100 bg-white hover:border-slate-200"
                        }`}
                      >
                        <div className={`text-[14px] font-extrabold ${on ? "text-white" : "text-slate-800"}`}>
                          {s.time}
                        </div>
                        <div
                          className={`text-[10.5px] font-semibold ${
                            on
                              ? "text-white/85"
                              : free
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {free ? "Trống" : `${s.booked} khách`}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-4 text-[11.5px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Trống
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Đã có khách
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Đang chọn
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* P1 — Ghi chú LUÔN visible (không phụ thuộc result). Agent có thể ghi
              note trước/sau/cùng lúc chọn radio. UX rõ ràng hơn. */}
          <div className="mt-4">
            <label className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              <Pencil size={13} /> Ghi chú
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder="Nội dung trao đổi, ghi chú về khách, hẹn lại lúc nào..."
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border-2 border-slate-100 bg-white px-3 py-2.5 text-[14px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-300"
            />
            <div className="mt-1 text-right text-[11px] text-slate-400">
              {notes.length}/500
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom save bar — constrain width vào max-w-md container giống content.
          Trên desktop preview (>448px), bar không tràn ra ngoài khung phone-frame. */}
      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          onClick={save}
          disabled={saveDisabled}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-3.5 text-[15px] font-bold text-white shadow-soft transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {/* P2 — loading state: spinner + text "Đang lưu..." khi đang call BE */}
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Đang lưu...
            </>
          ) : (
            <>
              <Save size={18} />{" "}
              {isFinalState
                ? "Cập nhật ghi chú"
                : showBooking
                  ? "Xác nhận đặt lịch"
                  : "Lưu kết quả"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
