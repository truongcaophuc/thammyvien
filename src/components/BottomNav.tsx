import { LayoutGrid, ListChecks, User } from "lucide-react";
import { NavLink } from "react-router-dom";

const items: { to: string; label: string; icon: typeof LayoutGrid }[] = [
  { to: "/overview", label: "Tổng quan", icon: LayoutGrid },
  { to: "/list", label: "Danh sách", icon: ListChecks },
  { to: "/profile", label: "Cá nhân", icon: User },
];

export default function BottomNav() {
  // Fixed bottom trong khung mobile (parent có class `relative` ở AppLayout).
  // Content area được pad `pb-[88px]` để không bị che.
  return (
    <nav className="absolute inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto grid max-w-md grid-cols-3 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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
