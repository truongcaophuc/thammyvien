import { useEffect, useState } from "react";
import {
  Search,
  X,
  Loader2,
  Library,
  ChevronRight,
  FileText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Sheet from "../components/Sheet";
import {
  kbTopTags,
  kbSearchQuery,
  kbSearchTag,
  kbToc,
  kbPage,
  kbPageByTag,
  cleanKbHtml,
  cleanSnippet,
  kbCache,
  type KbTag,
  type KbHit,
  type KbTocShelf,
  type KbPage,
} from "../lib/kb";

// Tag định danh trang ghim "Nguyên tắc tư vấn" (khớp trang KB bên CEP).
const PINNED_KEY = "type";
const PINNED_VALUE = "retreat";

const pretty = (s: string) => (s || "").replace(/-/g, " ");

export default function KbSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"browse" | "results">("browse");

  const [tags, setTags] = useState<KbTag[] | null>(kbCache.tags);
  const [hits, setHits] = useState<KbHit[] | null>(null);
  const [resultTitle, setResultTitle] = useState("Kết quả");
  const [toc, setToc] = useState<KbTocShelf[] | null>(kbCache.toc);
  const [pinned, setPinned] = useState<{ name: string; html: string } | null>(kbCache.pinned);

  const [reader, setReader] = useState<{ name: string; html: string } | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [focusShelf, setFocusShelf] = useState<number | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Chỉ fetch khi cache trống → đổi tab quay lại hiện ngay từ cache, không load lại.
    if (kbCache.tags === null)
      kbTopTags()
        .then((t) => { if (!cancelled) { setTags(t); kbCache.tags = t; } })
        .catch(() => !cancelled && setTags([]));
    if (kbCache.toc === null)
      kbToc()
        .then((s) => { if (!cancelled) { setToc(s); kbCache.toc = s; } })
        .catch(() => !cancelled && setToc([]));
    if (kbCache.pinned === null)
      kbPageByTag(PINNED_KEY, PINNED_VALUE)
        .then((p) => {
          if (cancelled || !p || p.error || !p.html) return;
          const v = { name: p.name || "Nguyên tắc tư vấn", html: cleanKbHtml(p.html) };
          setPinned(v);
          kbCache.pinned = v;
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // bỏ tag lượt thấp (rác) khỏi UI
  const topTags = (tags ?? []).filter((t) => t.count >= 2);
  const maxTagCount = topTags[0]?.count || 1;

  async function runSearch(q: string) {
    const t = q.trim();
    if (!t) return;
    setMode("results");
    setResultTitle(`Tìm: "${t}"`);
    setHits(null);
    try {
      setHits(await kbSearchQuery(t));
    } catch {
      setHits([]);
    }
  }

  async function runTag(tag: KbTag) {
    setMode("results");
    setResultTitle(pretty(tag.value));
    setHits(null);
    try {
      setHits(await kbSearchTag(tag.key, tag.value));
    } catch {
      setHits([]);
    }
  }

  async function openPage(id: number | string, name?: string) {
    setTocOpen(false);
    setReader({ name: name || "Nội dung", html: "" });
    setReaderLoading(true);
    try {
      const p: KbPage = await kbPage(id);
      setReader({ name: p.name || name || "Nội dung", html: p.html ? cleanKbHtml(p.html) : "" });
    } catch {
      setReader({ name: name || "Nội dung", html: "" });
    } finally {
      setReaderLoading(false);
    }
  }

  function openShelf(id: number) {
    setFocusShelf(id);
    setTocOpen(true);
  }

  function clearSearch() {
    setQuery("");
    setMode("browse");
    setHits(null);
  }

  return (
    <div className="pb-28">
      {/* Header gradient thương hiệu + search */}
      <div className="rounded-b-[28px] bg-gradient-to-br from-brand-600 to-brand-500 px-4 pb-5 pt-6 shadow-soft">
        <div className="flex items-center gap-2 text-white">
          <Library size={20} strokeWidth={2.4} />
          <h1 className="text-[19px] font-extrabold tracking-tight">Tra cứu KB</h1>
        </div>
        <p className="mt-0.5 text-[12.5px] text-white/85">Tìm nhanh kịch bản, quy trình, tài liệu</p>
        <div className="mt-3.5 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 shadow-card">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
            placeholder="Tìm nội dung…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={clearSearch} aria-label="Xoá tìm kiếm" className="shrink-0 cursor-pointer text-slate-400">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Chủ đề phổ biến — danh sách xếp hạng (kiểu trending) */}
      {topTags.length > 0 && mode === "browse" && (
        <div className="px-4 pt-5">
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-400">
            <TrendingUp size={13} /> Chủ đề phổ biến
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {topTags.map((t, i) => {
              const rankCls =
                i === 0
                  ? "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-soft"
                  : i < 3
                  ? "bg-brand-100 text-brand-700"
                  : "bg-slate-100 text-slate-500";
              return (
                <button
                  key={t.tag}
                  onClick={() => runTag(t)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-brand-50/60 ${
                    i > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums ${rankCls}`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold capitalize text-slate-800">
                        {pretty(t.value)}
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{t.count} lượt</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                        style={{ width: `${Math.max(8, Math.round((t.count / maxTagCount) * 100))}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-4 pt-5">
        {mode === "results" ? (
          <ResultsView title={resultTitle} hits={hits} onOpen={openPage} onBack={clearSearch} />
        ) : (
          <ShelfList toc={toc} onOpenShelf={openShelf} />
        )}
      </div>

      {/* FAB Nguyên tắc tư vấn — canh theo khung app (max-w-md) */}
      {pinned && !!pinned.html && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-30 mx-auto flex max-w-md justify-end px-4">
          <button
            onClick={() => setPinnedOpen(true)}
            aria-label="Nguyên tắc tư vấn"
            className="pointer-events-auto flex h-12 cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 pl-4 pr-5 text-[13px] font-bold text-white shadow-soft transition-transform active:scale-95"
          >
            <Sparkles size={18} /> Nguyên tắc
          </button>
        </div>
      )}

      {/* Sheet: Mục lục */}
      {tocOpen && (
        <Sheet title="Mục lục" onClose={() => setTocOpen(false)} bg="#ffffff">
          <div className="px-4 pb-4">
            <TocView toc={toc} focusShelf={focusShelf} onOpen={openPage} />
          </div>
        </Sheet>
      )}

      {/* Sheet: Nguyên tắc */}
      {pinnedOpen && pinned && (
        <Sheet title={pinned.name} onClose={() => setPinnedOpen(false)} bg="#ffffff">
          <div className="px-4 pb-4">
            {/* Hiển thị NGUYÊN nội dung HTML từ BookStack (giữ h3/list/màu inline) — không thêm style card của app */}
            <div
              className="text-[14px] leading-relaxed text-slate-700 [&_a]:text-brand-600 [&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:text-[15px] [&_h3]:font-bold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-slate-900 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: pinned.html }}
            />
          </div>
        </Sheet>
      )}

      {/* Sheet: Reader */}
      {reader && (
        <Sheet title={reader.name} onClose={() => setReader(null)} bg="#ffffff">
          <div className="px-4 pb-4">
            {readerLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-slate-400">
                <Loader2 size={18} className="animate-spin" /> Đang tải…
              </div>
            ) : reader.html ? (
              <div
                className="text-[14px] leading-relaxed text-slate-700 [&_a]:text-brand-600 [&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-slate-900 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: reader.html }}
              />
            ) : (
              <div className="py-10 text-center text-[13px] text-slate-400">Không tải được nội dung.</div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ===== Danh mục (kệ) — lấp khoảng trống, browse nhanh =====
function ShelfList({
  toc,
  onOpenShelf,
}: {
  toc: KbTocShelf[] | null;
  onOpenShelf: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Danh mục</div>
      {toc === null ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : toc.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-slate-400">Không tải được danh mục.</div>
      ) : (
        <div className="space-y-2.5">
          {toc.map((shelf) => (
            <button
              key={shelf.id}
              onClick={() => onOpenShelf(shelf.id)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card transition-transform active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Library size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-snug text-slate-800">{shelf.name}</span>
                <span className="mt-0.5 block text-[11.5px] text-slate-400">{shelf.books.length} sách</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Kết quả search =====
function ResultsView({
  title,
  hits,
  onOpen,
  onBack,
}: {
  title: string;
  hits: KbHit[] | null;
  onOpen: (id: number | string, name?: string) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="truncate text-[12px] font-bold uppercase tracking-wide text-slate-400">{title}</span>
        <button onClick={onBack} className="shrink-0 cursor-pointer pl-2 text-[12px] font-semibold text-brand-600">
          Đóng
        </button>
      </div>
      {hits === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-slate-400">
          <Loader2 size={18} className="animate-spin" /> Đang tìm…
        </div>
      ) : hits.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-slate-400">Không tìm thấy nội dung phù hợp.</div>
      ) : (
        <div className="space-y-2.5">
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => onOpen(h.page_id, h.title)}
              className="w-full cursor-pointer rounded-2xl bg-white p-3.5 text-left shadow-card transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <FileText size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-slate-800">{h.title || "(không tiêu đề)"}</div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">
                    {cleanSnippet(h.chunk_text)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Mục lục (Shelf → Book → Chapter → Page) =====
function TocView({
  toc,
  focusShelf,
  onOpen,
}: {
  toc: KbTocShelf[] | null;
  focusShelf: number | null;
  onOpen: (id: number | string, name?: string) => void;
}) {
  if (toc === null) {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Đang tải…
      </div>
    );
  }
  if (toc.length === 0) {
    return <div className="py-6 text-center text-[13px] text-slate-400">Không tải được mục lục.</div>;
  }
  return (
    <div className="space-y-1">
      {toc.map((shelf) => (
        <details key={shelf.id} className="group" open={shelf.id === focusShelf}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[14px] font-bold text-slate-800">
            <ChevronRight size={15} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
            {shelf.name}
          </summary>
          <div className="ml-2 border-l border-slate-100 pl-2.5">
            {shelf.books.map((book) => (
              <details key={book.id} className="group/b">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[13.5px] font-semibold text-slate-700">
                  <ChevronRight size={14} className="shrink-0 text-slate-400 transition-transform group-open/b:rotate-90" />
                  {book.name}
                </summary>
                <div className="ml-2 border-l border-slate-100 pl-2.5">
                  {book.chapters.map((ch) => (
                    <details key={ch.id} className="group/c">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[13px] font-medium text-slate-600">
                        <ChevronRight size={13} className="shrink-0 text-slate-400 transition-transform group-open/c:rotate-90" />
                        {ch.name}
                      </summary>
                      <div className="ml-4">
                        {ch.pages.map((pg) => (
                          <PageRow key={pg.id} name={pg.name} onClick={() => onOpen(pg.id, pg.name)} />
                        ))}
                      </div>
                    </details>
                  ))}
                  {book.pages.map((pg) => (
                    <PageRow key={pg.id} name={pg.name} onClick={() => onOpen(pg.id, pg.name)} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function PageRow({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-1.5 py-1.5 text-left text-[13px] text-slate-600 active:text-brand-600"
    >
      <FileText size={13} className="mt-0.5 shrink-0 text-brand-400" />
      <span>{name}</span>
    </button>
  );
}
