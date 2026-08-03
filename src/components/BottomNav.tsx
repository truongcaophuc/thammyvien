import { LayoutGrid, ListChecks, BookOpen, User } from "lucide-react";
import { NavLink } from "react-router-dom";

export type NavItem = { to: string; label: string; icon: typeof LayoutGrid };

// Nav mặc định của workspace Telesale (giữ nguyên hành vi cũ).
const TELESALE_ITEMS: NavItem[] = [
  { to: "/overview", label: "Tổng quan", icon: LayoutGrid },
  { to: "/list", label: "Danh sách", icon: ListChecks },
  { to: "/kb", label: "Tra cứu", icon: BookOpen },
  { to: "/profile", label: "Cá nhân", icon: User },
];

export default function BottomNav({ items = TELESALE_ITEMS }: { items?: NavItem[] }) {
  // Fixed bottom trong khung mobile (parent có class `relative` ở AppLayout).
  // Content area được pad `pb-[88px]` để không bị che.
  return (
    <nav className="absolute inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div
        className="mx-auto grid max-w-md px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            aria-label={label}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-xl py-1.5 transition-colors"
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={23}
                  strokeWidth={isActive ? 2.6 : 2}
                  className={isActive ? "text-brand-600" : "text-slate-400"}
                />
                <span
                  className={`text-[11px] font-semibold ${
                    isActive ? "text-brand-600" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
