import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, MessageCircle, Loader2,
  ClipboardList, Check, CheckCircle2,
  ChevronDown, Pencil,
} from "lucide-react";
import {
  saveTreatmentRecord, fetchPatientSessions,
  completeSession,
  type Patient, type Session,
} from "../../lib/technician";
import { ProtocolView, parseProtocol, normLabel } from "../../components/ProtocolView";
import CustomerProfileCard from "../../components/CustomerProfileCard";
import CareStatusEditor from "../../components/CareStatusEditor";
import { getCalendarResources, type CalendarResource } from "../../lib/calendar";

// Hai chiều Trợ lý được đụng. Hằng cấp module vì prop `only` là mảng — inline sẽ đổi ref mỗi render.
const TECHNICIAN_TAGS = ["customer_tier", "debt_status"];

// Chi tiết khách điều trị: Trợ lý cập nhật phác đồ tổng và hoàn tất buổi.
// Nhật ký từng buổi/ảnh trước sau chuyển sang màn CSKH để hồ sơ điều trị nằm một chỗ.

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
  const [showDiscard, setShowDiscard] = useState(false);
  const [doctors, setDoctors] = useState<CalendarResource[]>([]);
  const [therapists, setTherapists] = useState<CalendarResource[]>([]);

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

  const anyDirty = protocolDirty;

  useEffect(() => {
    let cancelled = false;
    fetchPatientSessions(patient.id).then((s) => {
      if (cancelled) return;
      // Chuẩn thiết kế: mỗi appointment = 1 buổi ĐÃ đặt lịch thật (không có "slot system").
      // Hiện tất cả — bỏ hack lọc theo source='system'.
      setSessions(s);
    });
    return () => { cancelled = true; };
  }, [patient.id]);

  useEffect(() => {
    let alive = true;
    getCalendarResources("staff-doctor").then((r) => alive && setDoctors(r)).catch(() => {});
    getCalendarResources("staff-technician").then((r) => alive && setTherapists(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

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

  function handleBack() {
    if (!anyDirty) return onBack();
    setShowDiscard(true);
  }

  const canSave = protocolDirty;
  const savingAny = savingProto;

  async function saveAll() {
    if (!canSave || savingAny) return;
    if (protocolDirty) await saveProto();
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

        {/* Phác đồ tổng — nhập theo form cấu trúc, lưu gộp thành text để CSKH/CEP đọc chung. */}
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
              <ProtoInput
                label="Tên liệu trình"
                required
                value={fields.tenLieuTrinh}
                onChange={(v) => setField("tenLieuTrinh", v)}
                placeholder="Tên liệu trình / gói buổi"
              />
              <ProtoInput
                label="Giá gói"
                required
                value={fields.giaGoi}
                onChange={(v) => setField("giaGoi", v)}
                placeholder="Ví dụ: 48.000.000"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <ProtoSelect
                  label="Bác sĩ"
                  required
                  value={fields.bacSi}
                  onChange={(v) => setField("bacSi", v)}
                  options={doctors.map((x) => x.name)}
                  placeholder="Chọn bác sĩ"
                />
                <ProtoSelect
                  label="ĐTV"
                  required
                  value={fields.dtv}
                  onChange={(v) => setField("dtv", v)}
                  options={therapists.map((x) => x.name)}
                  placeholder="Chọn ĐTV"
                />
              </div>
              <ProtoInput
                label="Mỹ phẩm dự kiến"
                value={fields.myPham}
                onChange={(v) => setField("myPham", v)}
                placeholder="Sản phẩm / mỹ phẩm dự kiến"
              />
              <ProtoInput
                label="Tình trạng / mục tiêu"
                value={fields.tinhTrangMucTieu}
                onChange={(v) => setField("tinhTrangMucTieu", v)}
                placeholder="Tình trạng hiện tại và mục tiêu sau liệu trình"
                rows={3}
              />
              <ProtoInput
                label="Note thêm cho CSKH"
                value={fields.noteCskh}
                onChange={(v) => setField("noteCskh", v)}
                placeholder="Thông tin cần CSKH lưu ý khi chăm khách"
                rows={3}
              />
              {protocolDirty && (
                <div className="text-[12px] font-medium text-amber-600">Có thay đổi chưa lưu</div>
              )}
            </div>
          ) : (
            <ProtocolView text={savedProtocol} />
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

    </div>
  );
}

// ---- Form phác đồ có cấu trúc, gộp thành text `Nhãn: value` khi lưu (backend giữ 1 cột) ----
type ProtoFields = {
  tenLieuTrinh: string;
  giaGoi: string;
  bacSi: string;
  dtv: string;
  myPham: string;
  tinhTrangMucTieu: string;
  noteCskh: string;
};
const PROTO_ORDER: { key: keyof ProtoFields; label: string }[] = [
  { key: "tenLieuTrinh", label: "Tên liệu trình" },
  { key: "giaGoi", label: "Giá gói" },
  { key: "bacSi", label: "Bác sĩ" },
  { key: "dtv", label: "ĐTV" },
  { key: "myPham", label: "Mỹ phẩm dự kiến" },
  { key: "tinhTrangMucTieu", label: "Tình trạng / mục tiêu" },
  { key: "noteCskh", label: "Note thêm cho CSKH" },
];
function emptyFields(): ProtoFields {
  return { tenLieuTrinh: "", giaGoi: "", bacSi: "", dtv: "", myPham: "", tinhTrangMucTieu: "", noteCskh: "" };
}

// text đã lưu -> tách về field mới; nhãn cũ được map sang nhóm gần nhất để không mất dữ liệu.
function protocolToFields(text: string): ProtoFields {
  const f = emptyFields();
  const keyOf = (name: string): keyof ProtoFields => {
    const n = normLabel(name);
    if (n.startsWith("ten lieu trinh") || n.startsWith("lieu trinh")) return "tenLieuTrinh";
    if (n.startsWith("gia goi") || n.startsWith("gia")) return "giaGoi";
    if (n.startsWith("bac si") || n.startsWith("bs")) return "bacSi";
    if (n.startsWith("dtv") || n.startsWith("dieu tri vien") || n.startsWith("ky thuat vien")) return "dtv";
    if (n.startsWith("my pham") || ["cong nghe", "may", "thiet bi", "san pham", "phuong phap"].some((k) => n.startsWith(k))) return "myPham";
    if (n.startsWith("tinh trang / muc tieu") || ["tinh trang", "chan doan", "hien trang", "da", "muc tieu", "ket qua", "mong muon"].some((k) => n.startsWith(k))) return "tinhTrangMucTieu";
    return "noteCskh";
  };
  for (const b of parseProtocol(text)) {
    const content = b.lines.join("\n").trim();
    if (!content) continue;
    const key = b.name ? keyOf(b.name) : "tinhTrangMucTieu";
    f[key] = f[key] ? f[key] + "\n" + content : content;
  }
  return f;
}

// Field -> text `Nhãn: value` (bỏ field trống) để read-mode parse lại đúng.
function fieldsToProtocol(f: ProtoFields): string {
  return PROTO_ORDER.filter((x) => f[x.key].trim())
    .map((x) => `${x.label}: ${f[x.key].trim()}`)
    .join("\n");
}

function ProtoInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  rows = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  rows?: number;
}) {
  const cls = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white";
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}{required ? " *" : ""}</label>
      {rows > 1 ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={`${cls} resize-y`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

function ProtoSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shownOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}{required ? " *" : ""}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2.5 text-left text-[13.5px] outline-none transition ${
          open ? "border-brand-400 bg-white ring-2 ring-brand-100" : "border-slate-200 text-slate-800"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${value ? "text-slate-800" : "text-slate-500"}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold transition ${
              !value ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {placeholder}
            {!value && <Check size={14} />}
          </button>
          {shownOptions.map((o) => {
            const selected = value === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={`mt-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold transition ${
                  selected ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 truncate">{o}</span>
                {selected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
