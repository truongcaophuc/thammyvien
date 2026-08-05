import { useEffect, useMemo, useRef, useState } from "react";
import { chipStyle } from "../lib/chipColor";
import { X, Loader2, Camera, Trash2, UserRound, Stethoscope, CalendarClock } from "lucide-react";
import { updateCareSession, UNASSIGN, type TreatmentPhoto } from "../lib/customerCare";
import { fileToBase64, type Session } from "../lib/technician";
import { getCalendarResources, type CalendarResource } from "../lib/calendar";

// CV-14: CSKH sửa toàn bộ thông tin 1 buổi — ngày/giờ · ĐTV · bác sĩ · nhật ký · ảnh.

// "yyyy-MM-ddTHH:mm:ss" -> "yyyy-MM-ddTHH:mm" cho <input type="datetime-local">
function toLocalInput(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}
interface AddedPhoto {
  file: File;
  url: string;
}

export default function SessionEditSheet({
  session,
  onClose,
  onSaved,
}: {
  session?: Session | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
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
        // bỏ trống = không đổi; UNASSIGN = gỡ gán
        therapistResourceId: effTherapistId ?? UNASSIGN,
        doctorResourceId: doctorId ?? UNASSIGN,
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

  return (
    <div className="fixed inset-0 z-[65]">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-800">
            {`Sửa buổi${session?.sessionNumber ? ` ${session.sessionNumber}` : ""}`}
          </div>
          <button onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
              <CalendarClock size={14} /> Ngày &amp; giờ
            </label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
              <UserRound size={14} /> Điều trị viên
            </div>
            {therapists.length === 0 ? (
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
                  const c = t.colorHex || "#7c3aed";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTherapistId(on ? null : t.id)}
                      className={chipCls}
                      style={chipStyle(c, on)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c }} />
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
                const c = d.colorHex || "#0ea5e9";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDoctorId(on ? null : d.id)}
                    className={chipCls}
                    style={chipStyle(c, on)}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c }} />
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

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
    </div>
  );
}
