import { MessageCircleMore, Lightbulb, Gem, CalendarCheck, Ear } from "lucide-react";
import type { Lead, ScriptStep } from "../data";
import Sheet from "../components/Sheet";

// TODO: migrate sang BE — fetch script theo campaign/product của lead.
const callScript: ScriptStep[] = [
  {
    key: "open",
    title: "Mở đầu — chào & xin phép",
    body:
      "Dạ em chào chị {ten} ạ. Em là Nguyễn Thị Lan, gọi từ Thẩm mỹ viện Hồng Ngọc ạ.\n\n" +
      "Em thấy chị có để lại thông tin quan tâm về {nhucau} bên mình. Không biết giờ chị tiện nghe máy ít phút không ạ?",
  },
  {
    key: "need",
    title: "Khơi gợi nhu cầu",
    body:
      "Dạ tình trạng da của mình hiện tại thế nào ạ? Chị bị lâu chưa ạ?\n\n" +
      "Trước giờ chị đã từng điều trị ở đâu chưa, kết quả thế nào ạ?",
    hint: "Lắng nghe & ghi nhận – đừng ngắt lời khách.",
  },
  {
    key: "solution",
    title: "Giới thiệu giải pháp",
    body:
      "Dạ với tình trạng của chị, bên em có liệu trình rất phù hợp. Điều trị tận gốc bằng công nghệ " +
      "hiện đại, cam kết hiệu quả rõ sau 3–5 buổi, có bác sĩ chuyên khoa trực tiếp theo dõi ạ.",
    hint: "Nhấn mạnh ưu đãi đang áp dụng trong tuần.",
  },
  {
    key: "close",
    title: "Chốt lịch hẹn",
    body:
      "Để chị trải nghiệm và được bác sĩ soi da miễn phí, em xếp cho chị một buổi tư vấn tại cơ sở nhé. " +
      "Chị tiện qua vào thứ Bảy hay Chủ Nhật này ạ?",
  },
];

const icons = [MessageCircleMore, Lightbulb, Gem, CalendarCheck];
const tints = [
  "bg-brand-100 text-brand-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-sky-100 text-sky-600",
];

export default function CallScriptSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const fill = (s: string) =>
    s.replace(/\{ten\}/g, lead.name).replace(/\{nhucau\}/g, lead.need.toLowerCase());

  return (
    <Sheet title="Kịch bản gọi" onClose={onClose}>
      <div className="space-y-3 px-4 pb-2">
        <p className="text-[13px] text-slate-500">
          Gợi ý lời thoại · linh hoạt theo khách <span className="font-semibold text-slate-700">{lead.name}</span>
        </p>
        {callScript.map((step, i) => {
          const Icon = icons[i % icons.length];
          return (
            <div key={step.key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tints[i % tints.length]}`}>
                  <Icon size={17} />
                </span>
                <span className="text-[14.5px] font-bold text-slate-800">
                  {i + 1}. {step.title}
                </span>
              </div>
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-600">
                {fill(step.body)}
              </p>
              {step.hint && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-700">
                  <Ear size={15} className="mt-0.5 shrink-0" />
                  {step.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
