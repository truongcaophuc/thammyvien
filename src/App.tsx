import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Overview from "./screens/Overview";
import CallList, { type FilterKey } from "./screens/CallList";
import Profile from "./screens/Profile";
import LeadDetail from "./screens/LeadDetail";
import Login from "./screens/Login";
import CallScriptSheet from "./modals/CallScriptSheet";
import type { Lead } from "./data";
import { checkSession, type AgentProfile } from "./lib/auth";

type AuthState = "checking" | "guest" | "authed";

// ============================================================================
// AuthContext-lite — đơn giản hoá: pass auth state qua App component.
// Nâng cấp lên React Context khi nhiều màn cần.
// ============================================================================
export default function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [, setProfile] = useState<AgentProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Verify session khi mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await checkSession();
        if (cancelled) return;
        if (user) {
          setProfile(user);
          setAuthState("authed");
        } else {
          setAuthState("guest");
        }
      } catch {
        if (!cancelled) setAuthState("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-300/60">
        <Loader2 size={32} className="animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            authState === "authed" ? (
              <Navigate to="/" replace />
            ) : (
              <Login
                onLoggedIn={(u) => {
                  setProfile(u);
                  setAuthState("authed");
                }}
              />
            )
          }
        />

        {/* Protected routes — share AppLayout (BottomNav) */}
        <Route
          element={
            <RequireAuth authState={authState}>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewRoute />} />
          <Route path="list" element={<ListRoute />} />
          <Route
            path="profile"
            element={
              <Profile
                onLoggedOut={() => {
                  setProfile(null);
                  setAuthState("guest");
                }}
              />
            }
          />
        </Route>

        {/* Lead detail — không có BottomNav */}
        <Route
          path="/lead/:id"
          element={
            <RequireAuth authState={authState}>
              <LeadDetailRoute showToast={showToast} />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast — global */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
          <div className="flex max-w-md items-center gap-2 rounded-xl bg-slate-900/95 px-4 py-3 text-[13.5px] font-medium text-white shadow-2xl">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Guards & Layouts
// ============================================================================
function RequireAuth({
  authState,
  children,
}: {
  authState: AuthState;
  children: React.ReactNode;
}) {
  const location = useLocation();
  if (authState !== "authed") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Shell có BottomNav (fixed bottom), dùng cho 3 tab chính.
 *  Dùng `h-screen` (KHÔNG phải `min-h-screen`) để cố định viewport height
 *  — content overflow scroll internal trong <main>, BottomNav luôn dính đáy. */
function AppLayout() {
  return (
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        {/* pb-[88px] để content cuối không bị BottomNav (~72px) che */}
        <main className="flex-1 overflow-y-auto pb-[88px]">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

// ============================================================================
// Route components — gắn navigation cho từng màn
// ============================================================================
function OverviewRoute() {
  const navigate = useNavigate();
  return (
    <Overview
      onStartCall={() => navigate("/list")}
      // "Xem tất cả lịch hẹn" → CallList với filter scheduled. State qua location
      // để CallList biết initial filter (replace default "to_call").
      onSeeAllAppointments={() =>
        navigate("/list", { state: { initialFilter: "scheduled" } })
      }
    />
  );
}

function ListRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  // Đọc initialFilter từ navigation state (nếu có) — cho phép Overview pre-select chip.
  const initialFilter = (location.state as { initialFilter?: FilterKey } | null)?.initialFilter;
  return (
    <CallList
      onOpenLead={(l) => navigate(`/lead/${l.id}`, { state: { lead: l } })}
      initialFilter={initialFilter}
    />
  );
}

function LeadDetailRoute({ showToast }: { showToast: (m: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const lead = (location.state as { lead?: Lead } | null)?.lead;
  const [scriptOpen, setScriptOpen] = useState(false);

  // Nếu truy cập trực tiếp URL (refresh) → state mất → quay về list.
  // Nâng cấp: fetch contact(id) từ entity-centric resolver để hỗ trợ deep-link.
  if (!lead) {
    return <Navigate to="/list" replace />;
  }

  return (
    // h-screen (không phải min-h-screen) — cố định viewport height. Nếu dùng min-h-screen
    // thì page tự grow theo content → scroll xảy ra trên html/body → sticky header trong
    // LeadDetail không bám vì scroll container không phải overflow-y-auto div.
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <div className="flex-1 overflow-y-auto">
          <LeadDetail
            lead={lead}
            onBack={() => navigate(-1)}
            onScript={() => setScriptOpen(true)}
            onSaved={(msg) => {
              showToast(msg);
              navigate("/list");
            }}
          />
        </div>
        {scriptOpen && (
          <CallScriptSheet lead={lead} onClose={() => setScriptOpen(false)} />
        )}
      </div>
    </div>
  );
}
