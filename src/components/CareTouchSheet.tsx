import { useRef, useState } from "react";
import { Camera, Loader2, MessageCircle, Phone, X } from "lucide-react";
import Sheet from "./Sheet";
import { logCareInteraction } from "../lib/customerCare";
import { fileToBase64, type Patient } from "../lib/technician";

type Channel = "message" | "call";

/**
 * Ghi nhận một lượt chăm có kèm ghi chú + ảnh minh chứng.
 * Tích nhanh (không ghi chú/ảnh) vẫn nằm ở hai nút ngoài thẻ khách; sheet này cho lượt cần dẫn chứng.
 * Kênh đã tích hôm nay thì gửi tiếp = bổ sung ảnh/ghi chú, KHÔNG bỏ tích (xem LogCareInteraction).
 */
export default function CareTouchSheet({
  patient,
  defaultChannel,
  onClose,
  onSaved,
}: {
  patient: Patient;
  defaultChannel: Channel;
  onClose: () => void;
  onSaved: (patch: Partial<Patient>, msg: string) => void;
}) {
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState<{ file: File; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const already = channel === "message" ? !!patient.messagedToday : !!patient.calledToday;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAdded((prev) => [...prev, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
    e.target.value = "";
  }

  async function save() {
    if (saving) return;
    if (!note.trim() && !added.length) return setErr("Thêm ghi chú hoặc ảnh minh chứng trước khi lưu.");
    setSaving(true);
    setErr(null);
    try {
      const photos = await Promise.all(added.map((a) => fileToBase64(a.file)));
      const r = await logCareInteraction(patient.id, channel, note.trim() || null, photos);
      onSaved(
        {
          interactedToday: true,
          messagedToday: channel === "message" ? true : patient.messagedToday,
          calledToday: channel === "call" ? true : patient.calledToday,
          todayProofCount: (patient.todayProofCount ?? 0) + photos.length,
          daysSinceInteraction: r.daysSinceInteraction,
          lastInteractionAt: r.lastInteractionAt,
        },
        photos.length ? `Đã lưu ${photos.length} ảnh minh chứng` : "Đã lưu ghi chú",
      );
    } catch {
      setErr("Không lưu được, thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Ghi nhận chăm sóc" onClose={onClose}>
      <div className="space-y-3 px-4">
        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <div className="text-[15px] font-bold text-slate-800">{patient.name}</div>
          <div className="text-[12.5px] text-slate-400">{patient.service}</div>
        </div>

        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Kênh liên hệ</div>
          <div className="flex gap-2">
            {([["message", "Nhắn tin", MessageCircle], ["call", "Gọi điện", Phone]] as const).map(([c, label, Icon]) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-bold transition active:scale-95 ${
                  channel === c ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {already && (
            <div className="mt-2 text-[12px] font-semibold text-emerald-600">
              Kênh này đã tích hôm nay — lưu thêm để bổ sung ghi chú/ảnh.
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Ghi chú</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Khách phản hồi gì, hẹn gì…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] outline-none placeholder:text-slate-400 focus:border-violet-300"
          />
        </div>

        <div className="rounded-2xl bg-white p-3.5 shadow-card">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Ảnh minh chứng {patient.todayProofCount ? `· hôm nay đã có ${patient.todayProofCount}` : ""}
          </div>
          <div className="flex flex-wrap gap-2">
            {added.map((a, i) => (
              <div key={i} className="relative">
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
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400"
            >
              <Camera size={18} />
              <span className="text-[10px] font-semibold">Thêm</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onPick} />
          </div>
        </div>

        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</div>}

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-[14.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Đang lưu…" : "Lưu lượt chăm"}
        </button>
      </div>
    </Sheet>
  );
}
