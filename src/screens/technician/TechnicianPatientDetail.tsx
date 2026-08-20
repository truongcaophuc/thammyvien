import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, MessageCircle, Loader2,
  ClipboardList, Check,
  ChevronDown, Pencil, Handshake, Wallet, Mic, Square, Upload, Trash2,
} from "lucide-react";
import {
  saveTreatmentRecord, fetchPatientSessions, fetchPatientRecordings, fileToBase64,
  type Patient, type Session, type TreatmentPhotoInput,
} from "../../lib/technician";
import { ProtocolView, parseProtocol, normLabel } from "../../components/ProtocolView";
import CustomerProfileCard from "../../components/CustomerProfileCard";
import CareStatusEditor from "../../components/CareStatusEditor";
import { getCalendarResources, type CalendarResource } from "../../lib/calendar";

// Hai chiều Trợ lý được đụng. Hằng cấp module vì prop `only` là mảng — inline sẽ đổi ref mỗi render.
const TECHNICIAN_TAGS = ["debt_status"];

// Chi tiết khách điều trị: Trợ lý cập nhật phác đồ điều trị.
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
  const initialProtocolFields = useMemo(() => protocolToFields(patient.protocol || ""), [patient.protocol]);
  const [fields, setFields] = useState<ProtoFields>(() => initialProtocolFields.fields);
  const [packagePrice, setPackagePrice] = useState(() =>
    patient.packagePrice ? fmtMoney(patient.packagePrice) : initialProtocolFields.legacyPackagePrice,
  );
  const [savedPackagePrice, setSavedPackagePrice] = useState(() =>
    patient.packagePrice ? fmtMoney(patient.packagePrice) : initialProtocolFields.legacyPackagePrice,
  );
  const [savedProtocol, setSavedProtocol] = useState((patient.protocol || "").trim());
  const [savingProto, setSavingProto] = useState(false);
  const [editingProto, setEditingProto] = useState(false); // read-mode có format; bấm "Sửa" mới về form 4 field
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [doctors, setDoctors] = useState<CalendarResource[]>([]);
  const [therapists, setTherapists] = useState<CalendarResource[]>([]);

  // --- Chốt gói + công nợ (mục 5/6 note tester) ---
  const [deal, setDeal] = useState<"closed" | "open" | null>(
    patient.dealStatus === "closed" || patient.dealStatus === "open" ? patient.dealStatus : null,
  );
  const [dealNote, setDealNote] = useState("");
  const [payFull, setPayFull] = useState(!patient.hasDebt);
  const [paid, setPaid] = useState(patient.paidAmount ? fmtMoney(patient.paidAmount) : "");
  const [debt, setDebt] = useState(patient.debtAmount ? fmtMoney(patient.debtAmount) : "");
  const [nextPay, setNextPay] = useState(patient.nextPaymentDate || "");
  const [recordings, setRecordings] = useState<TreatmentPhotoInput[]>([]);
  const [savedRecordings, setSavedRecordings] = useState<string[]>([]);
  const [formMsg, setFormMsg] = useState("");
  const hasCareAgent = !!patient.careAgentId || !!patient.careAgentName;
  const showCareAgentInDeal = hasCareAgent;
  const lockDealChoice = patient.dealStatus === "closed";
  const dealDirty =
    deal !== (patient.dealStatus ?? null) ||
    recordings.length > 0 ||
    dealNote.trim() !== "" ||
    payFull !== !patient.hasDebt ||
    paid !== (patient.paidAmount ? fmtMoney(patient.paidAmount) : "") ||
    debt !== (patient.debtAmount ? fmtMoney(patient.debtAmount) : "") ||
    nextPay !== (patient.nextPaymentDate || "");

  // Gộp 4 field -> text `Nhãn: value` (nguồn để lưu).
  const protocolText = useMemo(() => fieldsToProtocol(fields), [fields]);
  // So dirty THEO FIELD (không so text thô): round-trip parse↔serialize không đồng nhất
  // vì phác đồ cũ có đoạn không nhãn -> gộp lại sẽ thêm "Tình trạng:" => luôn báo "có thay đổi".
  const savedFields = useMemo(() => protocolToFields(savedProtocol).fields, [savedProtocol]);
  const protocolDirty = useMemo(
    () => (Object.keys(fields) as (keyof ProtoFields)[]).some((k) => fields[k].trim() !== savedFields[k].trim()),
    [fields, savedFields],
  );
  const packagePriceDirty = packagePrice !== savedPackagePrice;
  const setField = (key: keyof ProtoFields, v: string) => setFields((p) => ({ ...p, [key]: v }));

  // Số buổi đã hoàn thành — ưu tiên đếm từ sessions để cập nhật ngay sau khi hoàn thành 1 buổi.
  const doneCount = useMemo(
    () => (sessions ? sessions.filter((s) => s.status === "completed").length : patient.sessionDone),
    [sessions, patient.sessionDone],
  );

  const anyDirty = protocolDirty || packagePriceDirty || dealDirty;

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

  // Ghi âm buổi tư vấn luôn hiện riêng, không phụ thuộc khách đã/chưa chốt.
  useEffect(() => {
    let alive = true;
    fetchPatientRecordings(patient.id).then((r) => alive && setSavedRecordings(r)).catch(() => {});
    return () => { alive = false; };
  }, [patient.id]);

  function handleBack() {
    if (!anyDirty) return onBack();
    setShowDiscard(true);
  }

  const canSave = protocolDirty || packagePriceDirty || dealDirty;
  const savingAny = savingProto;

  // Một lần lưu duy nhất: phác đồ + kết quả chốt + công nợ + ghi âm.
  // Khách đã có CSKH phụ trách thì chỉ lưu hồ sơ, không chuyển lại vào pool.
  async function saveAll() {
    if (!canSave || savingAny) return;
    setFormMsg("");
    if (deal === "open" && !dealNote.trim()) {
      setFormMsg("Vui lòng nhập lý do chưa chốt trước khi lưu hồ sơ.");
      return;
    }
    if (deal === "closed" && !payFull && !nextPay) {
      setFormMsg("Còn công nợ thì phải có ngày hẹn trả tiếp.");
      return;
    }
    const closing = deal === "closed";
    const dealStatusToSave = closing && hasCareAgent ? null : deal;
    setSavingProto(true);
    try {
      const res = await saveTreatmentRecord({
        customerId: patient.id,
        protocol: protocolText.trim(),
        dealStatus: dealStatusToSave,
        dealNote: deal === "open" ? dealNote.trim() : undefined,
        recordings: recordings.length ? recordings : undefined,
        serviceName: fields.tenLieuTrinh.trim() || undefined,
        packagePrice: parseMoney(packagePrice) ?? undefined,
        paidAmount: closing ? (payFull ? parseMoney(packagePrice) : parseMoney(paid)) : undefined,
        debtAmount: closing ? (payFull ? 0 : parseMoney(debt)) : undefined,
        nextPaymentDate: closing && !payFull ? nextPay || null : undefined,
      });
      if (res.success) {
        setSavedProtocol(protocolText.trim());
        setSavedPackagePrice(packagePrice);
        setEditingProto(false); // lưu xong -> quay lại read-mode có format
        setRecordings([]);
        onSaved(
          deal === "closed" && hasCareAgent ? "Đã lưu hồ sơ — khách đã có CSKH phụ trách"
            : deal === "closed" ? "Đã chốt gói — hồ sơ đã chuyển CSKH"
            : deal === "open" ? "Đã trả hồ sơ về Telesale"
            : "Đã lưu phác đồ điều trị",
        );
      }
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Lưu không thành công, thử lại");
    } finally {
      setSavingProto(false);
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
      </header>

      <div className="space-y-3 p-4 pb-28">
        {/* Hồ sơ khách Telesale nhập — CSKH dùng chung component này. */}
        <CustomerProfileCard customerId={patient.id} />

        {/* Phân loại KH + tình trạng thanh toán — sửa ở ĐÂY (tab Lịch hẹn chỉ hiển thị).
            Tag gắn ở khách/liệu trình nên CSKH kế thừa ngay; các chiều riêng của CSKH
            (care_status / mức hài lòng) không hiện ở đây. */}
        <CareStatusEditor customerId={patient.id} only={TECHNICIAN_TAGS} />

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <RecordBlock
            items={recordings}
            saved={savedRecordings}
            onAdd={(x) => setRecordings((p) => [...p, x])}
            onRemove={(i) => setRecordings((p) => p.filter((_, k) => k !== i))}
          />
        </div>

        {/* Kết quả buổi tư vấn. "Đã chốt" mở phác đồ điều trị + công nợ và đẩy hồ sơ sang CSKH;
            "Chưa chốt" thu về lý do + ghi âm rồi trả hồ sơ cho Telesale. */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2.5 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <Handshake size={17} className="text-brand-600" /> Chốt gói
          </div>
          {showCareAgentInDeal && (
            <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-[13px] text-sky-700">
              CSKH phụ trách: <span className="font-bold">{patient.careAgentName || "Đã phân"}</span>
            </div>
          )}
          {!lockDealChoice && (
            <div className="grid grid-cols-2 gap-2">
              <SegBtn active={deal === "closed"} tone="brand" onClick={() => setDeal(deal === "closed" ? null : "closed")}>Đã chốt</SegBtn>
              <SegBtn active={deal === "open"} tone="brand" onClick={() => setDeal(deal === "open" ? null : "open")}>Chưa chốt</SegBtn>
            </div>
          )}

          {deal === "open" && (
            <div className="mt-3 space-y-3">
              <ProtoInput
                label="Lý do chưa chốt"
                required
                value={dealNote}
                onChange={(v) => { setDealNote(v); if (formMsg) setFormMsg(""); }}
                placeholder="Khách phân vân giá / cần hỏi ý gia đình / hẹn quay lại…"
                rows={3}
              />
              {formMsg && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">
                  {formMsg}
                </div>
              )}
              <p className="text-[12px] leading-relaxed text-slate-400">
                Lưu xong hồ sơ được trả về Telesale phụ trách kèm lý do này.
              </p>
            </div>
          )}
        </div>

        {/* Phác đồ điều trị — nhập theo form cấu trúc, lưu gộp thành text để CSKH/CEP đọc chung. */}
        <div className={`rounded-2xl bg-white p-4 shadow-sm ${deal === "open" ? "hidden" : ""}`}>
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <ClipboardList size={17} className="text-brand-600" /> Phác đồ điều trị
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
                onClick={() => { setFields(protocolToFields(savedProtocol).fields); setPackagePrice(savedPackagePrice); setEditingProto(false); }}
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
                value={packagePrice}
                onChange={(v) => setPackagePrice(moneyDigits(v))}
                // Vào ô thì bỏ dấu chấm: chuỗi khi gõ = đúng cái user gõ nên con trỏ không nhảy về cuối.
                onFocus={() => setPackagePrice(moneyDigits(packagePrice))}
                onBlur={() => setPackagePrice(fmtMoneyInput(packagePrice))}
                inputMode="numeric"
                placeholder="Ví dụ: 48.000.000"
              />

              {/* Tình trạng thanh toán — ngay dưới Giá gói, theo Spec app-tro-ly. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
                  <Wallet size={14} className="text-emerald-600" /> Tình trạng thanh toán
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SegBtn active={payFull} tone="brand" onClick={() => setPayFull(true)}>Đã thanh toán đủ</SegBtn>
                  <SegBtn active={!payFull} tone="brand" onClick={() => setPayFull(false)}>Còn nợ</SegBtn>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                  {payFull
                    ? "Hồ sơ sẽ kế thừa trạng thái đã thanh toán đủ cho CSKH."
                    : "Bắt buộc nhập đã trả, còn nợ và ngày hẹn trả tiếp."}
                </p>
                {!payFull && (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <ProtoInput label="Đã thanh toán" value={paid} onChange={(v) => setPaid(moneyDigits(v))} onFocus={() => setPaid(moneyDigits(paid))} onBlur={() => setPaid(fmtMoneyInput(paid))} inputMode="numeric" placeholder="20.000.000" />
                      <ProtoInput label="Còn nợ" value={debt} onChange={(v) => setDebt(moneyDigits(v))} onFocus={() => setDebt(moneyDigits(debt))} onBlur={() => setDebt(fmtMoneyInput(debt))} inputMode="numeric" placeholder="28.000.000" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[12px] font-bold text-slate-600">Ngày hẹn trả tiếp *</label>
                      <input
                        type="date"
                        value={nextPay}
                        onChange={(e) => { setNextPay(e.target.value); if (formMsg) setFormMsg(""); }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-brand-400"
                      />
                    </div>
                    {formMsg && (
                      <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">
                        {formMsg}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                label="Mỹ phẩm"
                value={fields.myPham}
                onChange={(v) => setField("myPham", v)}
                placeholder="Sản phẩm / mỹ phẩm sử dụng"
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
            <>
              {savedPackagePrice && (
                <div className="mb-2.5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <span className="text-[12px] font-bold text-slate-500">Giá gói</span>
                  <span className="text-[13.5px] font-bold text-slate-800">{savedPackagePrice} đ</span>
                </div>
              )}
              <ProtocolView text={fieldsToProtocol(protocolToFields(savedProtocol).fields)} />
              {/* Công nợ không nằm trong text phác đồ (lưu ở liệu trình) nên phải render riêng ở chế độ xem. */}
              <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
                  <Wallet size={14} className={payFull ? "text-emerald-600" : "text-rose-500"} /> Tình trạng thanh toán
                </div>
                <div className={`mt-1 text-[13.5px] font-semibold ${payFull ? "text-emerald-600" : "text-rose-600"}`}>
                  {payFull ? "Đã thanh toán đủ" : `Còn nợ ${debt || "—"}`}
                </div>
                {!payFull && (
                  <div className="mt-0.5 text-[12.5px] text-slate-500">
                    Đã trả {paid || "—"}
                    {nextPay && ` · hẹn trả tiếp ${nextPay.split("-").reverse().join("/")}`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-white px-3 pb-3 pt-2">
        {formMsg && deal !== "open" && !(deal === "closed" && !payFull) && (
          <div className="mb-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-center text-[12.5px] font-semibold text-rose-600">
            {formMsg}
          </div>
        )}
        <button
          onClick={saveAll}
          disabled={!canSave || savingAny}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-200 py-3 text-[15px] font-bold text-white shadow-xl shadow-black/10 transition-colors disabled:cursor-not-allowed disabled:opacity-100 enabled:bg-brand-600 enabled:hover:bg-brand-700"
        >
          {savingAny ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {savingAny
            ? "Đang lưu…"
            : deal === "closed" && hasCareAgent ? "Lưu hồ sơ"
            : deal === "closed" ? "Lưu & chuyển pool CSKH"
            : deal === "open" ? "Lưu & trả hồ sơ về Telesale"
            : "Lưu kết quả"}
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

    </div>
  );
}

// ---- Tiền: hiển thị có dấu chấm, gửi backend là số nguyên ----
function fmtMoney(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}
/** Người dùng gõ tới đâu chấm tới đó; giữ chuỗi rỗng khi xoá hết. */
function fmtMoneyInput(v: string): string {
  const digits = moneyDigits(v);
  return digits ? fmtMoney(Number(digits)) : "";
}
function moneyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}
/** "48.000.000" -> 48000000; rỗng -> null (backend hiểu là không đổi). */
function parseMoney(v: string): number | null {
  const digits = (v || "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Nút 2 lựa chọn kiểu segmented (chốt gói / tình trạng thanh toán). */
function SegBtn({
  active, tone, onClick, disabled, children,
}: {
  active: boolean;
  tone: "brand" | "emerald" | "rose" | "slate";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const on = {
    brand: "border-brand-500 bg-brand-50 text-brand-700",
    emerald: "border-emerald-500 bg-emerald-50 text-emerald-700",
    rose: "border-rose-400 bg-rose-50 text-rose-600",
    slate: "border-slate-400 bg-slate-100 text-slate-700",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border-2 py-2.5 text-[13.5px] font-bold transition ${
        disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
          : active ? on
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Ghi âm buổi tư vấn: nút thu trực tiếp (MediaRecorder) + chọn file có sẵn.
 * Trình duyệt không có MediaRecorder hoặc từ chối mic (iOS Safari hay chặn) thì
 * ẩn nút thu, vẫn upload được — nên luôn có đường lưu ghi âm.
 */
function RecordBlock({
  items, saved, onAdd, onRemove,
}: {
  items: TreatmentPhotoInput[];
  saved: string[];
  onAdd: (x: TreatmentPhotoInput) => void;
  onRemove: (i: number) => void;
}) {
  const canRecord = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  // Rời màn hình giữa chừng: dừng recorder để mic không kẹt sáng.
  useEffect(() => () => { recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const start = useCallback(async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        onAdd(await fileToBase64(new File([blob], `ghi-am-${Date.now()}.${ext}`, { type: blob.type })));
      };
      recRef.current = rec;
      rec.start();
      setSecs(0);
      setRecording(true);
    } catch {
      setErr("Không truy cập được micro — dùng nút Chọn file để tải ghi âm lên.");
    }
  }, [onAdd]);

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div>
      <div className="mb-1.5 text-[12px] font-bold text-slate-600">Ghi âm buổi tư vấn</div>
      <div className="flex items-center gap-2">
        {canRecord && (
          recording ? (
            <button type="button" onClick={stop}
              className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-[13px] font-bold text-white">
              <Square size={14} /> Dừng {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
            </button>
          ) : (
            <button type="button" onClick={start}
              className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50">
              <Mic size={14} /> Ghi âm
            </button>
          )
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50">
          <Upload size={14} /> Chọn file
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const fs = Array.from(e.target.files || []);
              for (const f of fs) onAdd(await fileToBase64(f));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {err && <div className="mt-1.5 text-[12px] text-rose-500">{err}</div>}

      {items.map((it, i) => (
        <div key={i} className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Mic size={14} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600">{it.fileName}</span>
          <button type="button" onClick={() => onRemove(i)} className="shrink-0 text-slate-400 hover:text-rose-500">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {saved.map((src, i) => (
        <audio key={`s${i}`} src={src} controls className="mt-2 w-full" />
      ))}
    </div>
  );
}

// ---- Form phác đồ có cấu trúc, gộp thành text `Nhãn: value` khi lưu (backend giữ 1 cột) ----
type ProtoFields = {
  tenLieuTrinh: string;
  bacSi: string;
  dtv: string;
  myPham: string;
  tinhTrangMucTieu: string;
  noteCskh: string;
};
const PROTO_ORDER: { key: keyof ProtoFields; label: string }[] = [
  { key: "tenLieuTrinh", label: "Tên liệu trình" },
  { key: "bacSi", label: "Bác sĩ" },
  { key: "dtv", label: "ĐTV" },
  { key: "myPham", label: "Mỹ phẩm" },
  { key: "tinhTrangMucTieu", label: "Tình trạng / mục tiêu" },
  { key: "noteCskh", label: "Note thêm cho CSKH" },
];
function emptyFields(): ProtoFields {
  return { tenLieuTrinh: "", bacSi: "", dtv: "", myPham: "", tinhTrangMucTieu: "", noteCskh: "" };
}

// text đã lưu -> tách về field mới; nhãn cũ được map sang nhóm gần nhất để không mất dữ liệu.
function protocolToFields(text: string): { fields: ProtoFields; legacyPackagePrice: string } {
  const f = emptyFields();
  let legacyPackagePrice = "";
  const keyOf = (name: string): keyof ProtoFields => {
    const n = normLabel(name);
    if (n.startsWith("ten lieu trinh") || n.startsWith("lieu trinh")) return "tenLieuTrinh";
    if (n.startsWith("bac si") || n.startsWith("bs")) return "bacSi";
    if (n.startsWith("dtv") || n.startsWith("dieu tri vien") || n.startsWith("ky thuat vien")) return "dtv";
    if (n.startsWith("my pham") || ["cong nghe", "may", "thiet bi", "san pham", "phuong phap"].some((k) => n.startsWith(k))) return "myPham";
    if (n.startsWith("tinh trang / muc tieu") || ["tinh trang", "chan doan", "hien trang", "da", "muc tieu", "ket qua", "mong muon"].some((k) => n.startsWith(k))) return "tinhTrangMucTieu";
    return "noteCskh";
  };
  for (const b of parseProtocol(text)) {
    const content = b.lines.join("\n").trim();
    if (!content) continue;
    if (b.name && (normLabel(b.name).startsWith("gia goi") || normLabel(b.name) === "gia")) {
      legacyPackagePrice = fmtMoneyInput(content);
      continue;
    }
    const key = b.name ? keyOf(b.name) : "tinhTrangMucTieu";
    f[key] = f[key] ? f[key] + "\n" + content : content;
  }
  return { fields: f, legacyPackagePrice };
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
  onBlur,
  onFocus,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  rows?: number;
  onBlur?: () => void;
  onFocus?: () => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const cls = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white";
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}{required ? " *" : ""}</label>
      {rows > 1 ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={`${cls} resize-y`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onFocus={onFocus} inputMode={inputMode} placeholder={placeholder} className={cls} />
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
