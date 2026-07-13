// KB (Knowledge Base) — gọi CEP /api/kb/* qua api() (cookie auth; WebApi filter fallback JWT).
// Trùng nguồn với trang dsds bên CEP web.
import { api } from "./api";

export interface KbTag {
  tag: string;
  key: string;
  value: string;
  count: number;
}
export interface KbHit {
  title: string;
  heading_path: string;
  chunk_text: string;
  url: string;
  page_id: number | string;
  price_from_vnd?: number | null;
  price_to_vnd?: number | null;
}
export interface KbTocPage {
  id: number;
  name: string;
  slug: string;
}
export interface KbTocChapter {
  id: number;
  name: string;
  pages: KbTocPage[];
}
export interface KbTocBook {
  id: number;
  name: string;
  slug: string;
  chapters: KbTocChapter[];
  pages: KbTocPage[];
}
export interface KbTocShelf {
  id: number;
  name: string;
  books: KbTocBook[];
}
export interface KbPage {
  id?: number;
  name?: string;
  slug?: string;
  html?: string;
  error?: string;
}

// Cache in-memory (module-level) — giữ khi đổi tab (component unmount) khỏi load lại từ đầu.
// Chỉ set khi fetch thành công; sống theo phiên app (reset khi reload trang).
export const kbCache: {
  tags: KbTag[] | null;
  toc: KbTocShelf[] | null;
  pinned: { name: string; html: string } | null;
} = { tags: null, toc: null, pinned: null };

function qs(o: Record<string, string | number | undefined>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// Search trả về chunk → 1 page có thể lặp; dedup theo page_id (giữ hit đầu = xếp hạng cao nhất).
function dedupByPage(hits: KbHit[]): KbHit[] {
  const seen = new Set<string>();
  const out: KbHit[] = [];
  for (const h of hits) {
    const k = String(h.page_id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export async function kbTopTags(limit = 8): Promise<KbTag[]> {
  const d = await api<{ tags?: KbTag[] }>(`/api/kb/TopTags?${qs({ limit })}`);
  return d.tags ?? [];
}

export async function kbSearchQuery(query: string, limit = 15): Promise<KbHit[]> {
  const d = await api<{ hits?: KbHit[] }>(`/api/kb/Search?${qs({ query, limit })}`);
  return dedupByPage(d.hits ?? []);
}

export async function kbSearchTag(tagKey: string, tagValue: string, limit = 20): Promise<KbHit[]> {
  const d = await api<{ hits?: KbHit[] }>(`/api/kb/Search?${qs({ tagKey, tagValue, limit })}`);
  return dedupByPage(d.hits ?? []);
}

export async function kbToc(): Promise<KbTocShelf[]> {
  const d = await api<{ shelves?: KbTocShelf[] }>(`/api/kb/Toc`);
  return d.shelves ?? [];
}

export async function kbPage(id: number | string): Promise<KbPage> {
  return api<KbPage>(`/api/kb/Page?${qs({ id })}`);
}

export async function kbPageByTag(key: string, value: string): Promise<KbPage> {
  return api<KbPage>(`/api/kb/PageByTag?${qs({ key, value })}`);
}

// Bỏ tiêu đề trùng (h1 đầu) + mục "Tag" ở cuối trang khi render nội dung.
export function cleanKbHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelector("h1")?.remove();
  // Bỏ footer nguồn/tag cuối trang: ".mn-foot" (hoặc đoạn bắt đầu "Nguồn: KB").
  doc.querySelectorAll(".mn-foot").forEach((el) => el.remove());
  doc.querySelectorAll("p,div").forEach((el) => {
    if (/^Nguồn:\s*KB/i.test((el.textContent || "").trim())) el.remove();
  });
  const heads = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  for (const hd of heads) {
    const t = (hd.textContent || "").trim().toLowerCase();
    if (t === "tag" || t === "tags") {
      let n: ChildNode | null = hd;
      while (n) {
        const nx: ChildNode | null = n.nextSibling;
        n.remove();
        n = nx;
      }
      break;
    }
  }
  return doc.body.innerHTML;
}

// Dọn snippet kết quả search: bỏ heading markdown đầu (trùng tiêu đề) + ký tự markdown + gộp khoảng trắng.
export function cleanSnippet(s: string): string {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/^\s*#{1,6}\s+[^\n]*\n?/, "")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Dọn breadcrumb: bỏ đoạn đầu trùng tiêu đề + gộp đoạn lặp liền kề.
// "Tiêu đề > Tiêu đề > Mục" (title="Tiêu đề") → "Mục".
export function dedupePath(s: string, title?: string): string {
  const t = (title || "").trim();
  const out: string[] = [];
  for (const seg of (s || "").split(">").map((x) => x.trim())) {
    if (seg === "") continue;
    if (out.length === 0 && t && seg === t) continue; // đoạn đầu trùng tiêu đề
    if (seg === out[out.length - 1]) continue; // lặp liền kề
    out.push(seg);
  }
  return out.join(" › ");
}

// Lọc các dòng <li> (cho trang dạng danh sách nguyên tắc).
export function parseKbListItems(html: string): string[] {
  const doc = new DOMParser().parseFromString(cleanKbHtml(html), "text/html");
  return Array.from(doc.querySelectorAll("li")).map((li) => li.innerHTML);
}
