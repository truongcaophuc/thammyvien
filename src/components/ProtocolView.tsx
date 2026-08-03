import { useMemo } from "react";
import { Stethoscope, Target, Settings2, AlertTriangle, CalendarClock, type LucideIcon } from "lucide-react";

// ---- Phác đồ tổng: parse text tự do -> mục có icon (auto theo nhãn, dùng chung ĐTV + CSKH) ----
export const PROTO_LABELS: { icon: LucideIcon; tint: string; keys: string[] }[] = [
  { icon: Stethoscope, tint: "text-brand-600", keys: ["tinh trang", "chan doan", "hien trang", "da"] },
  { icon: Target, tint: "text-emerald-600", keys: ["muc tieu", "ket qua", "mong muon"] },
  { icon: Settings2, tint: "text-sky-600", keys: ["cong nghe", "may", "thiet bi", "san pham", "phuong phap", "cong nghe/san pham"] },
  { icon: AlertTriangle, tint: "text-amber-600", keys: ["luu y", "chu y", "kieng", "canh bao", "chong chi dinh"] },
  { icon: CalendarClock, tint: "text-violet-600", keys: ["gian cach", "lich", "tan suat", "chu ky", "theo doi"] },
];

// bỏ dấu + thường hoá để so khớp nhãn (gõ hoa/thường/có dấu đều nhận)
export const normLabel = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").trim();

type ProtoBlock = { name?: string; icon?: LucideIcon; tint?: string; lines: string[] };

export function parseProtocol(text: string): ProtoBlock[] {
  const blocks: ProtoBlock[] = [];
  let cur: ProtoBlock | null = null;
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line) { cur = null; continue; } // dòng trống -> ngắt nhóm
    const ci = line.search(/[:：]/);
    let matched: (typeof PROTO_LABELS)[number] | undefined;
    if (ci > 0 && ci <= 24) {
      const left = normLabel(line.slice(0, ci));
      matched = PROTO_LABELS.find((l) => l.keys.some((k) => left === k || left.startsWith(k)));
    }
    if (matched) {
      const rest = line.slice(ci + 1).trim();
      cur = { name: line.slice(0, ci).trim(), icon: matched.icon, tint: matched.tint, lines: rest ? [rest] : [] };
      blocks.push(cur);
    } else if (cur && cur.icon) {
      cur.lines.push(line); // dòng nối tiếp của mục phía trên
    } else {
      if (!cur || cur.icon) { cur = { lines: [] }; blocks.push(cur); }
      cur.lines.push(line); // đoạn văn thường (không nhãn)
    }
  }
  return blocks;
}

export function ProtocolView({ text }: { text: string }) {
  const blocks = useMemo(() => parseProtocol(text), [text]);
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) =>
        b.icon ? (
          <div key={i}>
            <div className={`flex items-center gap-1.5 text-[13px] font-bold ${b.tint}`}>
              <b.icon size={15} /> {b.name}
            </div>
            <div className="mt-0.5 whitespace-pre-line pl-[21px] text-[13.5px] leading-relaxed text-slate-600">
              {b.lines.join("\n")}
            </div>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-600">
            {b.lines.join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
