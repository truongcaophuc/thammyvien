import { useEffect } from "react";
import { X } from "lucide-react";

/** Bottom sheet trượt lên từ đáy, có backdrop, khoá scroll nền */
export default function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-[fadeIn_.2s_ease]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl2 bg-[#f6f7fb] shadow-2xl animate-[slideUp_.25s_cubic-bezier(.16,1,.3,1)]"
      >
        <div className="flex items-center justify-between rounded-t-2xl2 bg-white px-4 py-3.5 shadow-card">
          <span className="text-[16px] font-extrabold text-slate-800">{title}</span>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3">{children}</div>
        {footer && (
          <div className="border-t border-slate-100 bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}
