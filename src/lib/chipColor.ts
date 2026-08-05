// Chip "tint mềm": nền = màu tag ở 10%, chữ = màu tag.
//
// Vấn đề: màu tag trong DB là bậc 500 (màu để TÔ), dùng luôn làm màu CHỮ thì tương phản
// chỉ ~2.0–2.5 nên nhìn loé và khó đọc. Ví dụ #f59e0b được 1.99, #a78bfa được 2.48.
//
// Cách xử lý: giữ nguyên nền và chấm (vẫn tươi như thiết kế), chỉ làm TỐI riêng màu chữ
// cho tới khi đạt ngưỡng WCAG AA 4.5. Tính tại chỗ thay vì thêm cột TextColor vào DB —
// tag nào ai thêm sau này cũng tự an toàn, không phụ thuộc người chọn màu.

const TINT_ALPHA = 0x1a / 255; // khớp hậu tố "1a" đang dùng ở các style chip
const AA_SMALL_TEXT = 4.5;

type Rgb = [number, number, number];

function parse(hex: string): Rgb | null {
  const h = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = ([r, g, b]: Rgb) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

// Độ sáng tương đối theo WCAG.
function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Nền tint thật sự mà mắt thấy: màu ở 10% chồng lên nền trắng của thẻ.
function tintOverWhite(c: Rgb): Rgb {
  return c.map((v) => v * TINT_ALPHA + 255 * (1 - TINT_ALPHA)) as Rgb;
}

const cache = new Map<string, string>();

/** Màu chữ đủ tương phản trên nền tint của chính màu đó. Màu hỏng thì trả về màu xám an toàn. */
export function chipInk(hex: string | null | undefined): string {
  if (!hex) return "#64748b";
  const cached = cache.get(hex);
  if (cached) return cached;

  const base = parse(hex);
  if (!base) return "#64748b";

  const bg = tintOverWhite(base);
  let ink: Rgb = base;
  // Tối dần 8%/bước; 30 bước đủ đưa cả màu sáng nhất về gần đen.
  // Làm tròn về 8-bit NGAY trong vòng lặp: nếu chỉ tính trên số thực rồi mới làm tròn ở
  // bước cuối, sai số làm tròn có thể kéo tương phản tụt lại dưới ngưỡng (đã gặp: 4.49).
  const round = (c: Rgb) => c.map((v) => Math.round(v)) as Rgb;
  ink = round(ink);
  for (let i = 0; i < 30 && contrast(ink, bg) < AA_SMALL_TEXT; i++) {
    ink = round(ink.map((v) => v * 0.92) as Rgb);
  }

  const out = toHex(ink);
  cache.set(hex, out);
  return out;
}

/**
 * Style cho 1 chip. selected = nền đặc chữ trắng; ngược lại nền tint + chữ đã chỉnh tương phản.
 * Dùng chung để 13 chỗ vẽ chip không lệch nhau mỗi khi đổi công thức.
 */
export function chipStyle(hex: string | null | undefined, selected = false): React.CSSProperties {
  const c = hex || "#94a3b8";
  return selected
    ? { background: c, color: "#fff" }
    : { background: `${c}1a`, color: chipInk(c) };
}

/** Màu chấm tròn trong chip — giữ nguyên độ tươi của màu gốc, không làm tối. */
export function chipDot(hex: string | null | undefined, selected = false): string {
  return selected ? "#fff" : hex || "#94a3b8";
}
