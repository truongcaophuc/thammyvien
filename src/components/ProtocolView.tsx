import { useMemo } from "react";
import {
  BadgeDollarSign,
  ClipboardList,
  MessageSquareText,
  PackageOpen,
  Stethoscope,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

// ---- Phác đồ tổng: parse text tự do -> mục có icon (auto theo nhãn, dùng chung ĐTV + CSKH) ----
export const PROTO_LABELS: { icon: LucideIcon; tint: string; keys: string[] }[] = [
  { icon: ClipboardList, tint: "text-brand-600", keys: ["ten lieu trinh", "lieu trinh"] },
  { icon: BadgeDollarSign, tint: "text-emerald-600", keys: ["gia goi", "gia"] },
  { icon: Stethoscope, tint: "text-sky-600", keys: ["bac si", "bs"] },
  { icon: UserRound, tint: "text-violet-600", keys: ["dtv", "dieu tri vien", "ky thuat vien"] },
  { icon: PackageOpen, tint: "text-cyan-600", keys: ["my pham", "cong nghe", "may", "thiet bi", "san pham", "phuong phap", "cong nghe/san pham"] },
  { icon: Target, tint: "text-emerald-600", keys: ["tinh trang / muc tieu", "tinh trang", "chan doan", "hien trang", "da", "muc tieu", "ket qua", "mong muon"] },
  { icon: MessageSquareText, tint: "text-amber-600", keys: ["note them cho cskh", "note cskh", "luu y", "chu y", "kieng", "canh bao", "chong chi dinh"] },
];

// bỏ dấu + thường hoá để so khớp nhãn (gõ hoa/thường/có dấu đều nhận)
export const normLabel = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").trim();

type ProtoBlock = { name?: string; icon?: LucideIcon; tint?: string; lines: string[] };

const STRUCTURED_FIELDS: { label: string; keys: string[]; icon: LucideIcon; tint: string }[] = [
  { label: "Tên liệu trình", keys: ["ten lieu trinh", "lieu trinh"], icon: ClipboardList, tint: "text-brand-600" },
  { label: "Giá gói", keys: ["gia goi", "gia"], icon: BadgeDollarSign, tint: "text-emerald-600" },
  { label: "Bác sĩ", keys: ["bac si", "bs"], icon: Stethoscope, tint: "text-sky-600" },
  { label: "ĐTV", keys: ["dtv", "dieu tri vien", "ky thuat vien"], icon: UserRound, tint: "text-violet-600" },
  { label: "Mỹ phẩm dự kiến", keys: ["my pham", "cong nghe", "may", "thiet bi", "san pham", "phuong phap", "cong nghe/san pham"], icon: PackageOpen, tint: "text-cyan-600" },
  { label: "Tình trạng / mục tiêu", keys: ["tinh trang / muc tieu", "tinh trang", "chan doan", "hien trang", "da", "muc tieu", "ket qua", "mong muon"], icon: Target, tint: "text-emerald-600" },
  { label: "Note thêm cho CSKH", keys: ["note them cho cskh", "note cskh", "luu y", "chu y", "kieng", "canh bao", "chong chi dinh"], icon: MessageSquareText, tint: "text-amber-600" },
];
const COMPACT_FIELD_INDEXES = new Set([1, 2, 3]);

function structuredKey(name: string): number {
  const n = normLabel(name);
  return STRUCTURED_FIELDS.findIndex((f) => f.keys.some((k) => n === k || n.startsWith(k)));
}

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
  const structured = useMemo(() => {
    const values = STRUCTURED_FIELDS.map(() => "");
    const loose: string[] = [];
    for (const b of blocks) {
      const content = b.lines.join("\n").trim();
      if (!content) continue;
      const idx = b.name ? structuredKey(b.name) : -1;
      if (idx >= 0) values[idx] = values[idx] ? `${values[idx]}\n${content}` : content;
      else loose.push(content);
    }
    return { values, loose };
  }, [blocks]);

  const hasStructured = structured.values.some(Boolean);

  if (hasStructured) {
    const compactItems = STRUCTURED_FIELDS
      .map((f, i) => ({ ...f, value: structured.values[i], index: i }))
      .filter((x) => COMPACT_FIELD_INDEXES.has(x.index) && x.value);

    return (
      <div className="space-y-2.5">
        {STRUCTURED_FIELDS.map((f, i) => {
          const value = structured.values[i];
          if (!value) return null;
          if (COMPACT_FIELD_INDEXES.has(i)) return null;
          const Icon = f.icon;
          return (
            <div key={f.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className={`flex items-center gap-1.5 text-[12px] font-bold ${f.tint}`}>
                <Icon size={14} /> {f.label}
              </div>
              <div className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">
                {value}
              </div>
            </div>
          );
        })}
        {compactItems.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {compactItems.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5">
                  <div className={`flex items-center gap-1 text-[11.5px] font-bold ${f.tint}`}>
                    <Icon size={13} className="shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[13.5px] leading-relaxed text-slate-700">
                    {f.value}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {structured.loose.length > 0 && (
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-600">
            {structured.loose.join("\n")}
          </p>
        )}
      </div>
    );
  }

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
