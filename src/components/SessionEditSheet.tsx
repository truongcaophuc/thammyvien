import { useEffect, useMemo, useRef, useState } from "react";
import { chipStyle } from "../lib/chipColor";
import { X, Loader2, Camera, Trash2, UserRound, Stethoscope, CalendarClock, Check, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { updateCareSession, UNASSIGN, type CareTagValue, type TreatmentPhoto } from "../lib/customerCare";
import { fileToBase64, type Session } from "../lib/technician";
import { getCalendarResources, type CalendarResource } from "../lib/calendar";

// CV-14: CSKH cập nhật toàn bộ thông tin 1 buổi — hoàn tất · ngày/giờ · ĐTV · bác sĩ · da · nhật ký · ảnh.

// "yyyy-MM-ddTHH:mm:ss" -> "yyyy-MM-ddTHH:mm" cho <input type="datetime-local">
function toLocalInput(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DEFAULT_TIME = "09:00";
const TIME_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function parseWhen(value: string) {
  const [date = "", rawTime = ""] = value.split("T");
  return { date, time: rawTime.slice(0, 5) || DEFAULT_TIME };
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
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

function formatWhenLabel(value: string) {
  if (!value) return "Chọn ngày & giờ";
  const { date, time } = parseWhen(value);
  if (!date) return "Chọn ngày & giờ";
  const d = parseYmd(date);
  const day = d.getDay() === 0 ? "CN" : `Thứ ${d.getDay() + 1}`;
  return `${day}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} · ${time}`;
}

function DateTimePickerSheet({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const fallback = `${toYmd(new Date())}T${DEFAULT_TIME}`;
  const initial = parseWhen(value || fallback);
  const [draftDate, setDraftDate] = useState(initial.date);
  const [draftTime, setDraftTime] = useState(initial.time);
  const initialMonth = parseYmd(initial.date);
  const [month, setMonth] = useState(() => ({ year: initialMonth.getFullYear(), index: initialMonth.getMonth() }));
  const today = toYmd(new Date());
  const quickDates = [0, 1, 2, 3, 4].map((days) => {
    const d = addDays(new Date(), days);
    return {
      value: toYmd(d),
      label: days === 0 ? "Hôm nay" : days === 1 ? "Ngày mai" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    };
  });
  const slots = useMemo(() => {
    if (TIME_SLOTS.includes(draftTime)) return TIME_SLOTS;
    return [...TIME_SLOTS, draftTime].sort();
  }, [draftTime]);

  function moveMonth(delta: number) {
    setMonth((prev) => {
      const d = new Date(prev.year, prev.index + delta, 1);
      return { year: d.getFullYear(), index: d.getMonth() };
    });
  }

  function pickDate(date: string) {
    setDraftDate(date);
    const d = parseYmd(date);
    setMonth({ year: d.getFullYear(), index: d.getMonth() });
  }

  function done() {
    onChange(`${draftDate}T${draftTime}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-950/35" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-800">Chọn ngày giờ</div>
          <button onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {quickDates.map((d) => {
              const on = draftDate === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => pickDate(d.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition active:scale-95 ${on ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {d.label}
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
                const on = draftDate === date;
                const isToday = today === date;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setDraftDate(date)}
                    className={`flex h-9 items-center justify-center rounded-full text-[13px] font-bold transition active:scale-95 ${
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

          <div>
            <div className="mb-2 text-[12px] font-bold text-slate-600">Giờ hẹn</div>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((time) => {
                const on = draftTime === time;
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDraftTime(time)}
                    className={`rounded-full px-2.5 py-2 text-[12.5px] font-bold transition active:scale-95 ${on ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {time}
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
          <div className="mb-2 text-center text-[13px] font-bold text-slate-700">{formatWhenLabel(`${draftDate}T${draftTime}`)}</div>
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

interface AddedPhoto {
  file: File;
  url: string;
}

export default function SessionEditSheet({
  session,
  skinValues = [],
  skinBusy,
  completing,
  onClose,
  onSaved,
  onSetSkin,
  onComplete,
}: {
  session?: Session | null;
  skinValues?: CareTagValue[];
  skinBusy?: boolean;
  completing?: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onSetSkin?: (appointmentId: string, valueSlug: string) => Promise<void> | void;
  onComplete?: (appointmentId: string) => Promise<void> | void;
}) {
  const [when, setWhen] = useState(() => (session ? toLocalInput(session.dateIso) : ""));
  // undefined = CSKH chưa đụng tới -> lấy mặc định suy từ buổi; null = đã chủ động bỏ chọn.
  const [therapistId, setTherapistId] = useState<string | null | undefined>(undefined);
  const [doctorId, setDoctorId] = useState<string | null>(session?.doctorId ?? null);
  const [note, setNote] = useState(session?.note ?? "");
  const [therapists, setTherapists] = useState<CalendarResource[]>([]);
  const [doctors, setDoctors] = useState<CalendarResource[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<AddedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dateTimeOpen, setDateTimeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Danh mục ĐTV + bác sĩ (không lọc chi nhánh: buổi cũ có thể ở chi nhánh khác).
  useEffect(() => {
    let alive = true;
    getCalendarResources("staff-technician").then((r) => alive && setTherapists(r)).catch(() => {});
    getCalendarResources("staff-doctor").then((r) => alive && setDoctors(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  // ĐTV hiện tại của buổi chỉ có TÊN (query không trả id) -> khớp ngược theo tên để chọn sẵn chip.
  const therapistName = session?.therapistName ?? null;
  const presetTherapistId = useMemo(() => {
    if (!therapistName) return null;
    return therapists.find((t) => t.name === therapistName)?.id ?? null;
  }, [therapistName, therapists]);
  const effTherapistId = therapistId === undefined ? presetTherapistId : therapistId;

  // Đã phân ở CEP (lễ tân check-in) hoặc lúc đặt buổi -> khoá, chỉ xem. Một vai chỉ có
  // MỘT nơi được sửa; nếu không, hai bên ghi đè nhau và không biết ai đúng.
  const therapistLocked = !!therapistName;
  const doctorLocked = !!session?.doctorId;

  const existingPhotos = useMemo(() => {
    if (!session) return [];
    return session.photos.map((url, i) => ({ url, id: session.photoIds?.[i] ?? null }));
  }, [session]);

  // Ảnh mới chọn -> objectURL, thu hồi khi rời sheet để khỏi rò bộ nhớ.
  useEffect(() => () => added.forEach((a) => URL.revokeObjectURL(a.url)), [added]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAdded((prev) => [...prev, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
    e.target.value = "";
  }

  function toggleRemove(id: string) {
    setRemovedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function save() {
    if (saving) return;
    setErr(null);
    if (!when) return setErr("Chưa chọn ngày giờ.");
    if (!session) return;

    setSaving(true);
    try {
      const photos: TreatmentPhoto[] = await Promise.all(added.map((a) => fileToBase64(a.file)));
      const startAt = `${when}:00`;

      const res = await updateCareSession({
        appointmentId: session.appointmentId,
        startAt,
        // bỏ trống (null) = không đổi; UNASSIGN = gỡ gán. Vai đã khoá thì không gửi gì
        // — trước đây ĐTV do CEP gán không khớp được id theo tên nên bị gửi UNASSIGN, gỡ mất gán.
        therapistResourceId: therapistLocked ? null : (effTherapistId ?? UNASSIGN),
        doctorResourceId: doctorLocked ? null : (doctorId ?? UNASSIGN),
        note,
        photos: photos.length ? photos : null,
        removePhotoIds: removedIds.size ? [...removedIds] : null,
      });
      onSaved(`Đã lưu buổi ${res.sessionNumber ?? ""}`.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  const chipCls = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95";
  const canComplete = session?.status === "checked_in";

  return (
    <div className="fixed inset-0 z-[65]">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-800">
            {`Cập nhật buổi${session?.sessionNumber ? ` ${session.sessionNumber}` : ""}`}
          </div>
          <button onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {canComplete && session && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-[13px] font-bold text-emerald-700">Buổi đang điều trị</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-emerald-700/80">
                Khi buổi đã xong, hoàn tất tại đây để CSKH đặt buổi kế tiếp.
              </div>
              <button
                type="button"
                disabled={!!completing}
                onClick={() => onComplete?.(session.appointmentId)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[12.5px] font-bold text-white transition active:scale-95 disabled:opacity-60"
              >
                {completing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {completing ? "Đang hoàn tất…" : "Hoàn tất buổi"}
              </button>
            </div>
          )}

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
              <CalendarClock size={14} /> Ngày &amp; giờ
            </label>
            <button
              type="button"
              onClick={() => setDateTimeOpen(true)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left text-[14px] font-semibold text-slate-700 outline-none transition hover:border-brand-300 focus:border-brand-400"
            >
              <span>{formatWhenLabel(when)}</span>
              <CalendarClock size={16} className="text-slate-400" />
            </button>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
              <UserRound size={14} /> Điều trị viên
            </div>
            {therapistLocked ? (
              <div className="flex items-center gap-2">
                <span className={`${chipCls} bg-slate-100 text-slate-600`}>
                  <Lock size={12} /> {therapistName}
                </span>
                <span className="text-[11.5px] text-slate-400">đã phân — đổi ở CEP</span>
              </div>
            ) : therapists.length === 0 ? (
              <div className="text-[12.5px] text-slate-400">Chưa có ĐTV trong danh mục tài nguyên.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTherapistId(null)}
                  className={`${chipCls} ${effTherapistId === null ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  Chưa chọn
                </button>
                {therapists.map((t) => {
                  const on = effTherapistId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTherapistId(on ? null : t.id)}
                      className={`${chipCls} ${on ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
              <Stethoscope size={14} /> Bác sĩ khám
            </div>
            {doctorLocked ? (
              <div className="flex items-center gap-2">
                <span className={`${chipCls} bg-slate-100 text-slate-600`}>
                  <Lock size={12} /> {session?.doctorName || "Đã phân"}
                </span>
                <span className="text-[11.5px] text-slate-400">đã phân — đổi ở CEP</span>
              </div>
            ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDoctorId(null)}
                className={`${chipCls} ${doctorId === null ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                Chưa chọn
              </button>
              {doctors.map((d) => {
                const on = doctorId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDoctorId(on ? null : d.id)}
                    className={`${chipCls} ${on ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {skinValues.length > 0 && session && (
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-slate-600">Tình trạng da</div>
              <div className="flex flex-wrap gap-1.5">
                {skinValues.map((v) => {
                  const on = session.skinSlug === v.slug;
                  const c = v.color || "#94a3b8";
                  return (
                    <button
                      key={v.slug}
                      type="button"
                      disabled={!!skinBusy}
                      onClick={() => onSetSkin?.(session.appointmentId, v.slug)}
                      className={chipCls}
                      style={chipStyle(c, on)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c }} />
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-slate-600">Nhật ký buổi</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Buổi này làm gì, da đáp ứng ra sao, dặn khách điều gì…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <div className="mb-1.5 text-[12px] font-bold text-slate-600">Ảnh</div>
            <div className="flex flex-wrap gap-2">
              {existingPhotos.map((p, i) => {
                const gone = !!p.id && removedIds.has(p.id);
                return (
                  <div key={p.id ?? i} className="relative">
                    <img
                      src={p.url}
                      alt=""
                      className={`h-16 w-16 rounded-lg border border-slate-200 object-cover ${gone ? "opacity-30" : ""}`}
                    />
                    {p.id && (
                      <button
                        type="button"
                        onClick={() => toggleRemove(p.id!)}
                        aria-label={gone ? "Hoàn tác xoá ảnh" : "Xoá ảnh"}
                        className={`absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white shadow ${gone ? "bg-slate-400" : "bg-rose-500"}`}
                      >
                        {gone ? <span className="text-[13px] font-bold">↺</span> : <Trash2 size={12} />}
                      </button>
                    )}
                  </div>
                );
              })}
              {added.map((a, i) => (
                <div key={`new-${i}`} className="relative">
                  <img src={a.url} alt="" className="h-16 w-16 rounded-lg border-2 border-emerald-300 object-cover" />
                  <button
                    type="button"
                    onClick={() => setAdded((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Bỏ ảnh vừa chọn"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500"
              >
                <Camera size={18} />
                <span className="text-[10px] font-semibold">Thêm</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={onPick}
              />
            </div>
          </div>

          {err && (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</div>
          )}
        </div>

        <div
          className="shrink-0 border-t border-slate-100 px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      {dateTimeOpen && (
        <DateTimePickerSheet
          value={when}
          onChange={setWhen}
          onClose={() => setDateTimeOpen(false)}
        />
      )}
    </div>
  );
}
