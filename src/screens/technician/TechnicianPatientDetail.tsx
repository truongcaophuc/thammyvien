import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, MessageCircle, ImagePlus, X, Loader2,
  ClipboardList, ChevronDown, CalendarClock, Check, CheckCircle2,
  Pencil, Stethoscope, Target, Settings2, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  saveTreatmentRecord, saveSessionRecord, fetchPatientSessions, fileToBase64,
  completeSession,
  type Patient, type Session,
} from "../../lib/technician";
import { ProtocolView, parseProtocol, normLabel } from "../../components/ProtocolView";
import CustomerProfileCard from "../../components/CustomerProfileCard";
import CareStatusEditor from "../../components/CareStatusEditor";

// Hai chiều Trợ lý được đụng. Hằng cấp module vì prop `only` là mảng — inline sẽ đổi ref mỗi render.
const TECHNICIAN_TAGS = ["customer_tier", "debt_status"];

// Chi tiết khách điều trị — HYBRID theo buổi (Internal Meeting mục 1):
//   1) Phác đồ TỔNG (kế hoạch liệu trình) — text/khách, cập nhật dần.
//   2) Nhật ký từng BUỔI — mỗi buổi ghi thao tác + ảnh trước/sau riêng.

// ISO -> dd/mm/yyyy. Rỗng/không hợp lệ -> "—".
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Chờ", cls: "bg-slate-100 text-slate-500" },
  confirmed: { label: "Đã xác nhận", cls: "bg-sky-50 text-sky-600" },
  arrived: { label: "Đã đến", cls: "bg-indigo-50 text-indigo-600" },
  checked_in: { label: "Đang làm", cls: "bg-amber-50 text-amber-600" },
  completed: { label: "Hoàn thành", cls: "bg-emerald-50 text-emerald-600" },
  cancelled: { label: "Đã huỷ", cls: "bg-rose-50 text-rose-500" },
  no_show: { label: "Vắng", cls: "bg-rose-50 text-rose-500" },
  rescheduled: { label: "Dời lịch", cls: "bg-violet-50 text-violet-600" },
};

export default function TechnicianPatientDetail({
  patient,
  onBack,
  onSaved,
}: {
  patient: Patient;
  onBack: () => void;
  onSaved: (msg: string) => void;
}) {
  const [fields, setFields] = useState<ProtoFields>(() => protocolToFields(patient.protocol || ""));
  const [savedProtocol, setSavedProtocol] = useState((patient.protocol || "").trim());
  const [savingProto, setSavingProto] = useState(false);
  const [editingProto, setEditingProto] = useState(false); // read-mode có format; bấm "Sửa" mới về form 4 field
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [activeAppointmentId, setActiveAppointmentId] = useState<string>("");
  const [draftByAppointmentId, setDraftByAppointmentId] = useState<Record<string, SessionDraft>>({});
  const [showDiscard, setShowDiscard] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null); // ảnh đang xem full

  // Gộp 4 field -> text `Nhãn: value` (nguồn để lưu).
  const protocolText = useMemo(() => fieldsToProtocol(fields), [fields]);
  // So dirty THEO FIELD (không so text thô): round-trip parse↔serialize không đồng nhất
  // vì phác đồ cũ có đoạn không nhãn -> gộp lại sẽ thêm "Tình trạng:" => luôn báo "có thay đổi".
  const savedFields = useMemo(() => protocolToFields(savedProtocol), [savedProtocol]);
  const protocolDirty = useMemo(
    () => (Object.keys(fields) as (keyof ProtoFields)[]).some((k) => fields[k].trim() !== savedFields[k].trim()),
    [fields, savedFields],
  );
  const setField = (key: keyof ProtoFields, v: string) => setFields((p) => ({ ...p, [key]: v }));

  const activeSession = useMemo(
    () => (sessions ?? []).find((s) => s.appointmentId === activeAppointmentId) ?? null,
    [sessions, activeAppointmentId],
  );

  // Buổi đang điều trị (checked_in) — nút "Hoàn thành buổi" chỉ tác động buổi này (giống Lịch hẹn).
  const checkedInSession = useMemo(
    () => (sessions ?? []).find((s) => s.status === "checked_in") ?? null,
    [sessions],
  );
  // Số buổi đã hoàn thành — ưu tiên đếm từ sessions để cập nhật ngay sau khi hoàn thành 1 buổi.
  const doneCount = useMemo(
    () => (sessions ? sessions.filter((s) => s.status === "completed").length : patient.sessionDone),
    [sessions, patient.sessionDone],
  );

  const activeDraft = useMemo(
    () => (activeAppointmentId ? draftByAppointmentId[activeAppointmentId] : undefined),
    [draftByAppointmentId, activeAppointmentId],
  );

  const activeSessionDirty = useMemo(() => {
    if (!activeDraft) return false;
    return activeDraft.note.trim() !== activeDraft.noteSaved.trim() || activeDraft.added.length > 0;
  }, [activeDraft]);

  const anyDirty = useMemo(() => {
    if (protocolDirty) return true;
    return Object.values(draftByAppointmentId).some(
      (d) => d.note.trim() !== d.noteSaved.trim() || d.added.length > 0,
    );
  }, [draftByAppointmentId, protocolDirty]);

  useEffect(() => {
    let cancelled = false;
    fetchPatientSessions(patient.id).then((s) => {
      if (cancelled) return;
      // Chuẩn thiết kế: mỗi appointment = 1 buổi ĐÃ đặt lịch thật (không có "slot system").
      // Hiện tất cả — bỏ hack lọc theo source='system'.
      const filtered = s;
      setSessions(filtered);
      setDraftByAppointmentId((prev) => {
        const next: Record<string, SessionDraft> = { ...prev };
        filtered.forEach((it) => {
          if (!next[it.appointmentId]) {
            next[it.appointmentId] = {
              note: it.note || "",
              noteSaved: (it.note || "").trim(),
              added: [],
              saving: false,
            };
          } else {
            next[it.appointmentId] = {
              ...next[it.appointmentId],
              note: next[it.appointmentId].note ?? (it.note || ""),
              noteSaved: next[it.appointmentId].noteSaved ?? (it.note || "").trim(),
            };
          }
        });
        return next;
      });

      setActiveAppointmentId((prevActive) => {
        if (prevActive && filtered.some((x) => x.appointmentId === prevActive)) return prevActive;
        const preferred =
          filtered.find((x) => x.status === "checked_in") ??
          filtered.find((x) => x.status === "arrived") ??
          filtered.find((x) => x.status === "confirmed") ??
          filtered[0];
        return preferred?.appointmentId ?? "";
      });
    });
    return () => { cancelled = true; };
  }, [patient.id]);

  async function saveProto() {
    setSavingProto(true);
    try {
      const res = await saveTreatmentRecord({ customerId: patient.id, protocol: protocolText.trim() });
      if (res.success) {
        setSavedProtocol(protocolText.trim());
        setEditingProto(false); // lưu xong -> quay lại read-mode có format
        onSaved("Đã lưu phác đồ tổng");
      }
    } finally {
      setSavingProto(false);
    }
  }

  function updateDraft(appointmentId: string, patch: Partial<SessionDraft>) {
    setDraftByAppointmentId((prev) => ({
      ...prev,
      [appointmentId]: { ...(prev[appointmentId] ?? emptyDraft()), ...patch },
    }));
  }

  function onPick(appointmentId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setDraftByAppointmentId((prev) => {
      const cur = prev[appointmentId] ?? emptyDraft();
      return {
        ...prev,
        [appointmentId]: {
          ...cur,
          added: [...cur.added, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))],
        },
      };
    });
    e.target.value = "";
  }

  async function saveActiveSession() {
    if (!activeSession || !activeDraft) return;
    updateDraft(activeSession.appointmentId, { saving: true });
    try {
      const photos = await Promise.all(activeDraft.added.map((a) => fileToBase64(a.file)));
      const res = await saveSessionRecord({
        appointmentId: activeSession.appointmentId,
        note: activeDraft.note.trim(),
        photos,
      });
      if (res.success) {
        setSessions((prev) =>
          (prev ?? []).map((s) =>
            s.appointmentId === activeSession.appointmentId
              ? { ...s, note: activeDraft.note.trim(), photos: res.photos }
              : s,
          ),
        );
        setDraftByAppointmentId((prev) => ({
          ...prev,
          [activeSession.appointmentId]: {
            ...prev[activeSession.appointmentId],
            note: activeDraft.note.trim(),
            noteSaved: activeDraft.note.trim(),
            added: [],
            saving: false,
          },
        }));
        onSaved("Đã lưu buổi");
      }
    } finally {
      updateDraft(activeSession.appointmentId, { saving: false });
    }
  }

  function handleBack() {
    if (!anyDirty) return onBack();
    setShowDiscard(true);
  }

  const canSave = protocolDirty || activeSessionDirty;
  const savingAny = savingProto || !!activeDraft?.saving;

  async function saveAll() {
    if (!canSave || savingAny) return;
    if (protocolDirty) await saveProto();
    if (activeSessionDirty) await saveActiveSession();
  }

  const [showComplete, setShowComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Hoàn thành buổi đang điều trị (checked_in → completed) — y hệt nút ở Lịch hẹn. Ở lại màn hình.
  async function handleComplete() {
    if (!checkedInSession) return;
    const aid = checkedInSession.appointmentId;
    setCompleting(true);
    try {
      const res = await completeSession(aid);
      if (res.success) {
        setSessions((prev) =>
          (prev ?? []).map((s) => (s.appointmentId === aid ? { ...s, status: "completed" } : s)),
        );
        setShowComplete(false);
        onSaved("Đã hoàn thành buổi");
      } else {
        onSaved(res.error || "Không hoàn thành được, thử lại");
      }
    } catch {
      onSaved("Không hoàn thành được, thử lại");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-3 py-3 shadow-sm">
        <button onClick={handleBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft size={22} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold text-slate-800">{patient.name}</div>
          <div className="text-[12px] text-slate-400">
            {patient.service || "Chưa gán liệu trình"} · Buổi {doneCount}/{patient.sessionTotal || "?"}
          </div>
        </div>
        {patient.zaloGroupUrl && (
          <a href={patient.zaloGroupUrl} target="_blank" rel="noreferrer" aria-label="Zalo group"
             className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100">
            <MessageCircle size={18} />
          </a>
        )}
        {checkedInSession && (
          <button
            type="button"
            onClick={() => setShowComplete(true)}
            aria-label="Hoàn tất buổi điều trị"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-100"
          >
            <CheckCircle2 size={15} /> Hoàn tất buổi điều trị
          </button>
        )}
      </header>

      <div className="space-y-3 p-4 pb-28">
        {/* Hồ sơ khách Telesale nhập — CSKH dùng chung component này. */}
        <CustomerProfileCard customerId={patient.id} />

        {/* Phân loại KH + tình trạng thanh toán — sửa ở ĐÂY (tab Lịch hẹn chỉ hiển thị).
            Tag gắn ở khách/liệu trình nên CSKH kế thừa ngay; các chiều riêng của CSKH
            (care_status / mức hài lòng) không hiện ở đây. */}
        <CareStatusEditor customerId={patient.id} only={TECHNICIAN_TAGS} />

        {/* Phác đồ tổng — nhập theo 4 field cấu trúc, lưu gộp thành text; xem ở dạng có mục + icon. */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <ClipboardList size={17} className="text-brand-600" /> Phác đồ tổng
            {savedProtocol && !editingProto && (
              <button
                onClick={() => setEditingProto(true)}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-600 hover:bg-brand-50"
              >
                <Pencil size={13} /> Sửa
              </button>
            )}
            {savedProtocol && editingProto && (
              <button
                onClick={() => { setFields(protocolToFields(savedProtocol)); setEditingProto(false); }}
                className="ml-auto rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                Hủy
              </button>
            )}
          </div>

          {editingProto || !savedProtocol ? (
            <div className="space-y-3">
              {PROTO_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={`mb-1 flex items-center gap-1.5 text-[12.5px] font-bold ${f.tint}`}>
                    <f.icon size={14} /> {f.label}
                  </label>
                  <textarea
                    value={fields[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                    rows={f.rows}
                    placeholder={f.ph}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
                  />
                </div>
              ))}
              {protocolDirty && (
                <div className="text-[12px] font-medium text-amber-600">Có thay đổi chưa lưu</div>
              )}
            </div>
          ) : (
            <ProtocolView text={savedProtocol} />
          )}
        </div>

        {/* Nhật ký từng buổi */}
        <div>
          <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-bold text-slate-500">
            <CalendarClock size={16} /> Nhật ký từng buổi
          </div>
          {sessions === null ? (
            <div className="flex justify-center py-10 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl bg-white py-10 text-center text-[13.5px] text-slate-400 shadow-sm">
              Chưa có buổi nào được phân cho bạn.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessions.map((s, idx) => {
                const d = draftByAppointmentId[s.appointmentId] ?? emptyDraft();
                const dirty = d.note.trim() !== d.noteSaved.trim() || d.added.length > 0;
                const displayNumber = s.sessionNumber ?? idx + 1;
                return (
                  <SessionItem
                    key={s.appointmentId}
                    session={s}
                    displayNumber={displayNumber}
                    open={s.appointmentId === activeAppointmentId}
                    dirty={dirty}
                    noteDraft={d.note}
                    added={d.added}
                    saving={d.saving}
                    onToggle={() =>
                      setActiveAppointmentId((cur) => (cur === s.appointmentId ? "" : s.appointmentId))
                    }
                    onChangeNote={(v) => updateDraft(s.appointmentId, { note: v })}
                    onPick={(e) => onPick(s.appointmentId, e)}
                    onRemoveAdded={(idx) =>
                      updateDraft(s.appointmentId, { added: d.added.filter((_, i) => i !== idx) })
                    }
                    onViewPhoto={setLightbox}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-white px-3 pb-3 pt-2">
        <button
          onClick={saveAll}
          disabled={!canSave || savingAny}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-200 py-3 text-[15px] font-bold text-white shadow-xl shadow-black/10 transition-colors disabled:cursor-not-allowed disabled:opacity-100 enabled:bg-brand-600 enabled:hover:bg-brand-700"
        >
          {savingAny ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {savingAny ? "Đang lưu…" : "Lưu kết quả"}
        </button>
      </div>

      {showDiscard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setShowDiscard(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-bold text-slate-900">Bỏ thay đổi?</div>
            <div className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
              Bạn đang có thay đổi chưa lưu. Rời khỏi màn hình sẽ mất nội dung này.
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowDiscard(false)}
                className="flex-1 cursor-pointer rounded-xl border-2 border-slate-200 py-2.5 text-[14px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Ở lại
              </button>
              <button
                onClick={() => { setShowDiscard(false); onBack(); }}
                className="flex-1 cursor-pointer rounded-xl bg-rose-500 py-2.5 text-[14px] font-bold text-white shadow-soft active:scale-[0.98]"
              >
                Bỏ và thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {showComplete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => !completing && setShowComplete(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={22} />
            </div>
            <div className="text-[16px] font-bold text-slate-900">Hoàn thành buổi này?</div>
            <div className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
              Đánh dấu buổi đang điều trị của <b>{patient.name}</b> đã xong.
            </div>
            <div className="mt-4 flex gap-2">
              <button
                disabled={completing}
                onClick={() => setShowComplete(false)}
                className="flex-1 cursor-pointer rounded-xl border-2 border-slate-200 py-2.5 text-[14px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                disabled={completing}
                onClick={handleComplete}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-[14px] font-bold text-white shadow-soft active:scale-[0.98] disabled:opacity-60"
              >
                {completing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Hoàn thành
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <X size={22} />
          </button>
          <img
            src={lightbox}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

type AddedPhoto = { file: File; url: string };

type SessionDraft = {
  note: string;
  noteSaved: string;
  added: AddedPhoto[];
  saving: boolean;
};

function emptyDraft(): SessionDraft {
  return { note: "", noteSaved: "", added: [], saving: false };
}

// ---- Form phác đồ có cấu trúc: 4 field, gộp thành text `Nhãn: value` khi lưu (backend giữ 1 cột) ----
type ProtoFields = { tinhtrang: string; muctieu: string; congnghe: string; luuy: string };
const PROTO_FIELDS: { key: keyof ProtoFields; label: string; icon: LucideIcon; tint: string; rows: number; ph: string }[] = [
  { key: "tinhtrang", label: "Tình trạng", icon: Stethoscope, tint: "text-brand-600", rows: 2, ph: "Tình trạng da hiện tại, chẩn đoán…" },
  { key: "muctieu", label: "Mục tiêu", icon: Target, tint: "text-emerald-600", rows: 2, ph: "Kết quả mong muốn sau liệu trình…" },
  { key: "congnghe", label: "Công nghệ", icon: Settings2, tint: "text-sky-600", rows: 2, ph: "Máy/công nghệ, sản phẩm dự kiến…" },
  { key: "luuy", label: "Lưu ý", icon: AlertTriangle, tint: "text-amber-600", rows: 3, ph: "Kiêng cữ, chống chỉ định, giãn cách, dặn dò…" },
];
function emptyFields(): ProtoFields { return { tinhtrang: "", muctieu: "", congnghe: "", luuy: "" }; }

// text đã lưu -> tách về 4 field (đoạn không nhãn = Tình trạng; nhãn lạ/Giãn cách dồn vào Lưu ý).
function protocolToFields(text: string): ProtoFields {
  const f = emptyFields();
  const keyOf = (name: string): keyof ProtoFields => {
    const n = normLabel(name);
    if (["tinh trang", "chan doan", "hien trang", "da"].some((k) => n.startsWith(k))) return "tinhtrang";
    if (["muc tieu", "ket qua", "mong muon"].some((k) => n.startsWith(k))) return "muctieu";
    if (["cong nghe", "may", "thiet bi", "san pham", "phuong phap"].some((k) => n.startsWith(k))) return "congnghe";
    return "luuy"; // lưu ý + mọi nhãn khác
  };
  for (const b of parseProtocol(text)) {
    const content = b.lines.join("\n").trim();
    if (!content) continue;
    const key = b.icon ? keyOf(b.name || "") : "tinhtrang"; // không nhãn -> Tình trạng
    f[key] = f[key] ? f[key] + "\n" + content : content;
  }
  return f;
}

// 4 field -> text `Nhãn: value` (bỏ field trống) để read-mode parse lại đúng.
function fieldsToProtocol(f: ProtoFields): string {
  return PROTO_FIELDS.filter((x) => f[x.key].trim())
    .map((x) => `${x.label}: ${f[x.key].trim()}`)
    .join("\n");
}

function buildPreview(session: Session): string {
  const note = (session.note || "").trim();
  if (note) return note.length > 70 ? note.slice(0, 70) + "…" : note;
  if ((session.photos?.length ?? 0) > 0) return "Có ảnh trước / sau";
  return "Chưa có nhật ký";
}

function SessionItem({
  session,
  displayNumber,
  open,
  dirty,
  noteDraft,
  added,
  saving,
  onToggle,
  onChangeNote,
  onPick,
  onRemoveAdded,
  onViewPhoto,
}: {
  session: Session;
  displayNumber: number;
  open: boolean;
  dirty: boolean;
  noteDraft: string;
  added: AddedPhoto[];
  saving: boolean;
  onToggle: () => void;
  onChangeNote: (v: string) => void;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAdded: (idx: number) => void;
  onViewPhoto: (url: string) => void;
}) {
  const st = STATUS[session.status] ?? { label: session.status || "—", cls: "bg-slate-100 text-slate-500" };
  const preview = buildPreview(session);

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-sm ${open ? "ring-1 ring-brand-200" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3.5 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[13px] font-bold text-brand-600">
          B{displayNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-slate-800">
              Buổi {displayNumber}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
            {dirty && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">
                Chưa lưu
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-slate-400">{fmtDate(session.dateIso)}</div>
          {!open && <div className="mt-1 truncate text-[12.5px] text-slate-500">{preview}</div>}
        </div>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3.5">
          <textarea
            value={noteDraft}
            onChange={(e) => onChangeNote(e.target.value)}
            rows={3}
            placeholder="Thao tác đã làm, máy/thông số, sản phẩm, phản ứng da, dặn dò…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
          />

          <div className="mt-3">
            <div className="mb-2 text-[12px] font-semibold text-slate-500">Ảnh trước / sau của buổi</div>
            <div className="flex flex-wrap gap-2">
              {(session.photos || []).map((url, i) => (
                <button
                  type="button"
                  key={"e" + i}
                  onClick={() => onViewPhoto(url)}
                  aria-label={`Xem ảnh ${i + 1}`}
                  className="h-20 w-20 cursor-zoom-in overflow-hidden rounded-xl border border-slate-200"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {added.map((p, i) => (
                <div key={"a" + i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-brand-300">
                  <img
                    src={p.url}
                    alt={p.file.name}
                    onClick={() => onViewPhoto(p.url)}
                    className="h-full w-full cursor-zoom-in object-cover"
                  />
                  <button
                    onClick={() => onRemoveAdded(i)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white"
                  ><X size={13} /></button>
                  <span className="absolute bottom-0 left-0 right-0 bg-brand-500/90 text-center text-[9px] font-bold text-white">mới</span>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
                <ImagePlus size={20} />
                <span className="text-[11px] font-semibold">Thêm ảnh</span>
                <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onPick} />
              </label>
            </div>
          </div>

          {(saving || dirty) && (
            <div className={`mt-2 text-[12px] font-medium ${saving ? "text-slate-400" : "text-amber-600"}`}>
              {saving ? "Đang lưu…" : "Có thay đổi chưa lưu"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
