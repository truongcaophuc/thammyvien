import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, MapPin, Check, Clock3, ClipboardList, CalendarClock, ChevronDown, X, Phone, Pencil } from "lucide-react";
import type { Patient } from "../../lib/dtv";
import { getArrivalAvailability, getCalendarBranches, type ArrivalSlot, type CalendarBranch } from "../../lib/calendar";
import { bookNextTreatmentSession, fetchCareTreatment, fetchSkinLevelValues, setCareTag, type CareTreatment, type CareTagValue } from "../../lib/cskh";
import CareStatusEditor from "../../components/CareStatusEditor";
import { ProtocolView } from "../../components/ProtocolView";

// trạng thái buổi (đọc-only cho CSKH)
const SESSION_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Chờ", cls: "bg-slate-100 text-slate-500" },
  confirmed: { label: "Đã xác nhận", cls: "bg-sky-50 text-sky-600" },
  arrived: { label: "Đã đến", cls: "bg-indigo-50 text-indigo-600" },
  checked_in: { label: "Đang làm", cls: "bg-amber-50 text-amber-600" },
  completed: { label: "Hoàn thành", cls: "bg-emerald-50 text-emerald-600" },
};

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatHm(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS_SHORT_VI = ["CN", "T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy"];
function buildBookingDays(): { label: string; iso: string; date: string }[] {
  const out: { label: string; iso: string; date: string }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const label = i === 0 ? "Hôm nay" : i === 1 ? "Mai" : WEEKDAYS_SHORT_VI[d.getDay()];
    out.push({ label, date: `${dd}/${mm}`, iso: `${d.getFullYear()}-${mm}-${dd}` });
  }
  return out;
}

export default function CskhBook({
  patient,
  onBack,
  onSaved,
}: {
  patient: Patient;
  onBack: () => void;
  onSaved: (msg: string) => void;
}) {
  const days = useMemo(() => buildBookingDays(), []);
  const [selectedIso, setSelectedIso] = useState(days[0]?.iso ?? localTodayIso());
  const [branches, setBranches] = useState<CalendarBranch[]>([]);
  const [branch, setBranch] = useState<CalendarBranch | null>(null);
  const [initialBranchId, setInitialBranchId] = useState<string>("");
  const [slots, setSlots] = useState<ArrivalSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [care, setCare] = useState<CareTreatment | null>(null);
  const [careOpen, setCareOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [openSessions, setOpenSessions] = useState<Set<string>>(() => new Set());
  const [skinValues, setSkinValues] = useState<CareTagValue[]>([]);
  const [skinBusy, setSkinBusy] = useState<string | null>(null); // appointmentId đang lưu
  const [skinSheetAppt, setSkinSheetAppt] = useState<string | null>(null); // buổi đang mở sheet ghi nhận da
  const toggleSession = (id: string) =>
    setOpenSessions((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    let cancelled = false;
    fetchCareTreatment(patient.id).then((c) => { if (!cancelled) setCare(c); }).catch(() => {});
    fetchSkinLevelValues().then((v) => { if (!cancelled) setSkinValues(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [patient.id]);

  // CV-13: đặt tình trạng da CHO 1 BUỔI (skin_level gắn theo CalendarAppointment). Bấm lại giá trị đang chọn = bỏ.
  async function setSessionSkin(appointmentId: string, valueSlug: string) {
    const cur = care?.sessions.find((s) => s.appointmentId === appointmentId)?.skinSlug ?? null;
    const next = cur === valueSlug ? null : valueSlug;
    const picked = skinValues.find((v) => v.slug === next) ?? null;
    setSkinBusy(appointmentId);
    setCare((prev) => prev && ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.appointmentId === appointmentId
          ? { ...s, skinSlug: next, skinName: picked?.name ?? null, skinColor: picked?.color ?? null }
          : s),
    }));
    try {
      await setCareTag(patient.id, "skin_level", next, appointmentId);
    } catch {
      fetchCareTreatment(patient.id).then(setCare).catch(() => {}); // lỗi -> nạp lại thật
    } finally {
      setSkinBusy(null);
    }
  }

  const nextSessionGuess = useMemo(() => Math.min(patient.sessionTotal || 999, (patient.sessionDone || 0) + 1), [patient.sessionDone, patient.sessionTotal]);

  useEffect(() => {
    let cancelled = false;
    getCalendarBranches()
      .then((bs) => {
        if (cancelled) return;
        setBranches(bs);
        setBranch(bs[0] ?? null);
        setInitialBranchId(bs[0]?.id ?? "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    getArrivalAvailability(selectedIso, branch.id)
      .then((s) => { if (!cancelled) setSlots(s); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [selectedIso, branch?.id]);

  const save = async () => {
    if (!branch || !slot || saving) return;
    setSaving(true);
    try {
      const res = await bookNextTreatmentSession({ customerId: patient.id, branchId: branch.id, startAt: slot });
      if (res.success) {
        onSaved(`Đã đặt lịch buổi ${res.sessionNumber} · ${ddmm(slot)} ${formatHm(slot)} tại ${branch.name}`);
        onBack();
      }
    } catch (e) {
      onSaved(`⚠ Lỗi: ${e instanceof Error ? e.message : "đặt lịch thất bại"}`);
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!branch && !!slot && !saving;
  const dirty =
    !!slot
    || selectedIso !== (days[0]?.iso ?? localTodayIso())
    || (!!branch?.id && !!initialBranchId && branch.id !== initialBranchId);

  function handleBack() {
    if (!dirty) return onBack();
    setShowDiscard(true);
  }

  return (
    <div className="min-h-full bg-[#eef0f5]">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-3 py-3 shadow-sm">
        <button onClick={handleBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft size={22} /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold text-slate-800">{patient.name}</div>
          <div className="text-[12px] text-slate-400">
            {patient.service || "Chưa gán liệu trình"} · Dự kiến đặt buổi {nextSessionGuess}/{patient.sessionTotal || "?"}
          </div>
        </div>
        {patient.phone && (
          <a
            href={`tel:${patient.phone}`}
            aria-label="Gọi khách"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          >
            <Phone size={18} />
          </a>
        )}
      </header>

      <div className="space-y-3 p-4 pb-28">
        {/* CV-13: sửa trạng thái (care_status / mức độ da / hài lòng) */}
        <CareStatusEditor customerId={patient.id} />
        {/* Hồ sơ điều trị (read-only) — CSKH xem để đặt lịch có ngữ cảnh */}
        {care && (care.protocol || care.sessions.length > 0) && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <button onClick={() => setCareOpen((o) => !o)} className="flex w-full items-center gap-2 p-4 text-left">
              <ClipboardList size={17} className="text-brand-600" />
              <span className="text-[14px] font-bold text-slate-800">Hồ sơ điều trị</span>
              <span className="text-[12px] text-slate-400">· {care.sessions.length} buổi</span>
              <ChevronDown size={18} className={`ml-auto shrink-0 text-slate-400 transition-transform ${careOpen ? "rotate-180" : ""}`} />
            </button>
            {careOpen && (
              <div className="space-y-3 border-t border-slate-100 p-4">
                <div>
                  <div className="mb-1.5 text-[12px] font-bold text-slate-500">Phác đồ tổng</div>
                  {care.protocol ? (
                    <ProtocolView text={care.protocol} />
                  ) : (
                    <div className="text-[12.5px] text-slate-400">Chưa có phác đồ tổng.</div>
                  )}
                </div>
                {care.sessions.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                      <CalendarClock size={14} /> Các buổi
                    </div>
                    <div className="space-y-2">
                      {care.sessions.map((s, idx) => {
                        const st = SESSION_STATUS[s.status] ?? { label: s.status || "—", cls: "bg-slate-100 text-slate-500" };
                        const open = openSessions.has(s.appointmentId);
                        return (
                          <div key={s.appointmentId} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                            <button
                              type="button"
                              onClick={() => toggleSession(s.appointmentId)}
                              className="flex w-full items-center gap-2 p-3 text-left"
                            >
                              <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-slate-800">Buổi {s.sessionNumber ?? idx + 1}</span>
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
                                {s.skinName && (
                                  <span
                                    className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                                    style={{ background: `${s.skinColor || "#94a3b8"}1a`, color: s.skinColor || "#64748b" }}
                                  >
                                    {s.skinName}
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-[11.5px] text-slate-400">{fmtDateFull(s.dateIso)}</span>
                              <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                            </button>
                            {open && (
                              <div className="border-t border-slate-100 p-3">
                                {s.note ? (
                                  <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">{s.note}</div>
                                ) : (
                                  <div className="text-[12.5px] text-slate-400">Chưa có nhật ký buổi này.</div>
                                )}
                                {s.photos.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {s.photos.map((url, i) => (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => setLightbox(url)}
                                        aria-label={`Xem ảnh buổi ${s.sessionNumber ?? idx + 1}`}
                                        className="h-16 w-16 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200"
                                      >
                                        <img src={url} alt="" className="h-full w-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {skinValues.length > 0 && (
                                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                                    <div className="min-w-0">
                                      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Tình trạng da</div>
                                      {s.skinName ? (
                                        <span
                                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                                          style={{ background: `${s.skinColor || "#94a3b8"}1a`, color: s.skinColor || "#64748b" }}
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.skinColor || "#94a3b8" }} />
                                          {s.skinName}
                                        </span>
                                      ) : (
                                        <span className="text-[12.5px] text-slate-400">Chưa ghi nhận</span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSkinSheetAppt(s.appointmentId)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-brand-600 transition hover:bg-brand-50"
                                    >
                                      <Pencil size={13} /> {s.skinName ? "Sửa" : "Ghi nhận"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <CalendarDays size={17} className="text-brand-600" /> Chọn ngày
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d.iso}
                onClick={() => setSelectedIso(d.iso)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left ${selectedIso === d.iso ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
              >
                <div className={`text-[12px] font-bold ${selectedIso === d.iso ? "text-brand-600" : "text-slate-500"}`}>{d.label}</div>
                <div className="text-[13px] font-semibold text-slate-800">{d.date}</div>
              </button>
            ))}
          </div>
          {/* Chọn ngày tự do (giống telesale) */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="shrink-0 text-[12.5px] text-slate-500">Hoặc ngày khác:</span>
            <input
              type="date"
              value={selectedIso}
              min={localTodayIso()}
              onChange={(e) => e.target.value && setSelectedIso(e.target.value)}
              className="flex-1 rounded-xl border-2 border-slate-100 px-3 py-1.5 text-[14px] text-slate-700 outline-none transition-colors focus:border-brand-300"
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <MapPin size={17} className="text-brand-600" /> Chọn chi nhánh
          </div>
          <select
            value={branch?.id ?? ""}
            onChange={(e) => setBranch(branches.find((b) => b.id === e.target.value) ?? null)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-700 outline-none focus:border-brand-400"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-slate-800">
            <Clock3 size={17} className="text-brand-600" /> Chọn giờ
          </div>
          {loadingSlots ? (
            <div className="flex justify-center py-8 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-[13.5px] text-slate-400">Không có khung giờ phù hợp.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots
                .filter((s) => !s.isPast)
                .map((s) => {
                  const disabled = s.available <= 0;
                  const on = slot === s.startAt;
                  return (
                    <button
                      key={s.startAt}
                      disabled={disabled}
                      onClick={() => setSlot(s.startAt)}
                      className={`rounded-xl border px-2.5 py-2 text-[13px] font-bold ${
                        disabled ? "border-slate-200 bg-slate-50 text-slate-300" :
                        on ? "border-brand-500 bg-brand-600 text-white" :
                        "border-slate-200 bg-white text-slate-700 hover:border-brand-400"
                      }`}
                    >
                      {formatHm(s.startAt)}
                      <div className={`mt-0.5 text-[10.5px] font-semibold ${on ? "text-white/80" : "text-slate-400"}`}>
                        {disabled ? "Hết chỗ" : `${s.available}/${s.capacity}`}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-white px-3 pb-3 pt-2">
        <button
          onClick={save}
          disabled={!canSave}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-200 py-3 text-[15px] font-bold text-white shadow-xl shadow-black/10 transition-colors disabled:cursor-not-allowed disabled:opacity-100 enabled:bg-brand-600 enabled:hover:bg-brand-700"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {saving ? "Đang đặt lịch…" : "Đặt lịch buổi tiếp theo"}
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
              Bạn đang chọn lịch hẹn. Rời khỏi màn hình sẽ mất lựa chọn này.
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

      {/* Bottom sheet: ghi nhận tình trạng da cho 1 buổi (không lồng trong nhật ký read-only) */}
      {(() => {
        const es = care?.sessions.find((x) => x.appointmentId === skinSheetAppt) || null;
        return (
          <div className={`fixed inset-0 z-[60] ${skinSheetAppt ? "" : "pointer-events-none"}`} aria-hidden={!skinSheetAppt}>
            <div
              onClick={() => setSkinSheetAppt(null)}
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${skinSheetAppt ? "opacity-100" : "opacity-0"}`}
            />
            <div
              className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 ${skinSheetAppt ? "translate-y-0" : "translate-y-full"}`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="text-[15px] font-bold text-slate-800">
                  Tình trạng da{es?.sessionNumber ? ` — Buổi ${es.sessionNumber}` : ""}
                </div>
                <button onClick={() => setSkinSheetAppt(null)} aria-label="Đóng" className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {skinValues.map((v) => {
                    const on = es?.skinSlug === v.slug;
                    const c = v.color || "#94a3b8";
                    return (
                      <button
                        key={v.slug}
                        type="button"
                        disabled={skinBusy === skinSheetAppt}
                        onClick={() => skinSheetAppt && setSessionSkin(skinSheetAppt, v.slug)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95 disabled:opacity-60"
                        style={on ? { background: c, color: "#fff" } : { background: `${c}1a`, color: c }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "#fff" : c }} />
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-slate-100 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
                <button onClick={() => setSkinSheetAppt(null)} className="w-full rounded-xl bg-violet-600 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]">
                  Xong
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
