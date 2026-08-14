import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Stethoscope, BookOpen, User as UserIcon, ClipboardList, LayoutGrid, CalendarDays } from "lucide-react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import BottomNav, { type NavItem } from "./components/BottomNav";
import Overview from "./screens/Overview";
import CallList, { setListFilter } from "./screens/CallList";
import KbSearch from "./screens/KbSearch";
import Profile from "./screens/Profile";
import LeadDetail from "./screens/LeadDetail";
import Login from "./screens/Login";
import TechnicianList from "./screens/technician/TechnicianList";
import TechnicianOverviewScreen from "./screens/technician/TechnicianOverview";
import TechnicianPatientDetail from "./screens/technician/TechnicianPatientDetail";
import TechnicianAppointments from "./screens/technician/TechnicianAppointments";
import CustomerCareList from "./screens/customerCare/CustomerCareList";
import CustomerCareOverviewScreen from "./screens/customerCare/CustomerCareOverview";
import CustomerCareBook from "./screens/customerCare/CustomerCareBook";
import CallScriptSheet from "./modals/CallScriptSheet";
import type { Lead } from "./data";
import { checkSession, type AgentProfile, type WorkspaceRole } from "./lib/auth";
import { fetchLeadById } from "./lib/leads";
import { fetchPatientById, type Patient } from "./lib/technician";
import { fetchCarePatientById } from "./lib/customerCare";
import { subscribeNotify } from "./lib/gqlSubscribe";
import { resyncPush } from "./lib/pushNotification";

type AuthState = "checking" | "guest" | "authed";

// Nav của workspace ĐTV (Điều trị viên).
const TECHNICIAN_NAV: NavItem[] = [
  { to: "/technician/overview", label: "Tổng quan", icon: LayoutGrid },
  { to: "/technician", label: "Khách ĐT", icon: Stethoscope },
  { to: "/technician/appointments", label: "Lịch hẹn", icon: CalendarDays },
  { to: "/technician/kb", label: "Tra cứu", icon: BookOpen },
  { to: "/technician/profile", label: "Cá nhân", icon: UserIcon },
];

// CV-07: "Việc hôm nay" là màn ĐÍCH khi CSKH đăng nhập (deliverable gọi là màn CV mở mỗi ngày),
// nhưng trong thanh nav vẫn để Tổng quan đứng đầu cho quen tay.
const CSKH_NAV: NavItem[] = [
  { to: "/customer-care/overview", label: "Tổng quan", icon: LayoutGrid },
  { to: "/customer-care", label: "Việc hôm nay", icon: ClipboardList },
  { to: "/customer-care/kb", label: "Tra cứu", icon: BookOpen },
  { to: "/customer-care/profile", label: "Cá nhân", icon: UserIcon },
];

export default function App() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await checkSession();
        if (cancelled) return;
        if (user) { setProfile(user); setAuthState("authed"); }
        else setAuthState("guest");
      } catch {
        if (!cancelled) setAuthState("guest");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authState === "authed") void resyncPush();
  }, [authState]);

  // Live-update qua GraphQL subscription (WebSocket): user nhận tín hiệu "có thông báo mới"
  // -> bắn 'sw-push' để màn Tổng quan/List refetch ngay (không lệ thuộc web push / quyền thông báo).
  useEffect(() => {
    if (authState !== "authed" || !profile?.Id) return;
    return subscribeNotify(profile.Id, () => window.dispatchEvent(new CustomEvent("sw-push")));
  }, [authState, profile?.Id]);

  // Bấm notification (web push) -> điều hướng tới deep-link (service worker gửi 'navigate').
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | undefined;
      if (d?.type === "navigate" && d.url) navigate(d.url);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [navigate]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const role: WorkspaceRole = profile?.Role === "customer_care" ? "customer_care" : profile?.Role === "technician" ? "technician" : "telesale";
  const homePath = role === "technician" ? "/technician/overview" : role === "customer_care" ? "/customer-care" : "/overview";

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
              <Login onLoggedIn={(u) => { setProfile(u); setAuthState("authed"); }} />
            )
          }
        />

        {/* Root → điều hướng theo role */}
        <Route
          index
          element={
            authState === "authed" ? <Navigate to={homePath} replace /> : <Navigate to="/login" replace />
          }
        />

        {/* ===== Workspace TELESALE ===== */}
        <Route
          element={
            <RequireAuth authState={authState}>
              <RequireRole role={role} allow="telesale" homePath={homePath}>
                <AppLayout />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route path="overview" element={<OverviewRoute />} />
          <Route path="list" element={<ListRoute />} />
          <Route path="kb" element={<KbSearch />} />
          <Route
            path="profile"
            element={<Profile onLoggedOut={() => { setProfile(null); setAuthState("guest"); }} />}
          />
        </Route>

        {/* Lead detail — không BottomNav (telesale) */}
        <Route
          path="/lead/:id"
          element={
            <RequireAuth authState={authState}>
              <LeadDetailRoute showToast={showToast} />
            </RequireAuth>
          }
        />

        {/* ===== Workspace ĐTV ===== */}
        <Route
          path="/technician"
          element={
            <RequireAuth authState={authState}>
              <RequireRole role={role} allow="technician" homePath={homePath}>
                <AppLayout navItems={TECHNICIAN_NAV} />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route index element={<TechnicianListRoute />} />
          <Route path="overview" element={<TechnicianOverviewRoute />} />
          <Route path="appointments" element={<TechnicianAppointments />} />
          <Route path="kb" element={<KbSearch />} />
          <Route
            path="profile"
            element={<Profile onLoggedOut={() => { setProfile(null); setAuthState("guest"); }} />}
          />
        </Route>

        {/* Chi tiết khách điều trị — không BottomNav */}
        <Route
          path="/technician/patient/:id"
          element={
            <RequireAuth authState={authState}>
              <TechnicianPatientRoute showToast={showToast} />
            </RequireAuth>
          }
        />

        {/* ===== Workspace CSKH ===== */}
        <Route
          path="/customer-care"
          element={
            <RequireAuth authState={authState}>
              <RequireRole role={role} allow="customer_care" homePath={homePath}>
                <AppLayout navItems={CSKH_NAV} />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route index element={<CustomerCareListRoute />} />
          <Route path="overview" element={<CustomerCareOverviewRoute />} />
          <Route path="kb" element={<KbSearch />} />
          <Route
            path="profile"
            element={<Profile onLoggedOut={() => { setProfile(null); setAuthState("guest"); }} />}
          />
        </Route>

        <Route
          path="/customer-care/book/:id"
          element={
            <RequireAuth authState={authState}>
              <CustomerCareBookRoute showToast={showToast} />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

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
function RequireAuth({ authState, children }: { authState: AuthState; children: React.ReactNode }) {
  const location = useLocation();
  if (authState !== "authed") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

// Chặn truy cập chéo workspace (telesale không vào /technician và ngược lại) → về home đúng role.
function RequireRole({ role, allow, homePath, children }: { role: WorkspaceRole; allow: WorkspaceRole; homePath: string; children: React.ReactNode }) {
  if (role !== allow) return <Navigate to={homePath} replace />;
  return <>{children}</>;
}

function AppLayout({ navItems }: { navItems?: NavItem[] }) {
  return (
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <main className="flex-1 overflow-y-auto pb-[88px]">
          <Outlet />
        </main>
        <BottomNav items={navItems} />
      </div>
    </div>
  );
}

// ============================================================================
// Route components — Telesale
// ============================================================================
function OverviewRoute() {
  const navigate = useNavigate();
  return (
    <Overview
      onStartCall={() => navigate("/list")}
      onSeeAllAppointments={() => { setListFilter("scheduled"); navigate("/list"); }}
    />
  );
}

function ListRoute() {
  const navigate = useNavigate();
  return <CallList onOpenLead={(l) => navigate(`/lead/${l.id}`, { state: { lead: l } })} />;
}

function LeadDetailRoute({ showToast }: { showToast: (m: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const stateLead = (location.state as { lead?: Lead } | null)?.lead;
  const [scriptOpen, setScriptOpen] = useState(false);
  const [lead, setLead] = useState<Lead | null>(stateLead ?? null);
  const [loading, setLoading] = useState(!stateLead);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (stateLead || !id) return;
    let cancelled = false;
    setLoading(true);
    fetchLeadById(id)
      .then((l) => { if (!cancelled) (l ? setLead(l) : setNotFound(true)); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, stateLead]);

  if (notFound) return <Navigate to="/list" replace />;
  if (loading || !lead) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-300/60 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <div className="flex-1 overflow-y-auto">
          <LeadDetail
            lead={lead}
            onBack={() => navigate(-1)}
            onScript={() => setScriptOpen(true)}
            onSaved={(msg) => { showToast(msg); navigate("/list"); }}
          />
        </div>
        {scriptOpen && <CallScriptSheet lead={lead} onClose={() => setScriptOpen(false)} />}
      </div>
    </div>
  );
}

// ============================================================================
// Route components — ĐTV
// ============================================================================
function TechnicianListRoute() {
  const navigate = useNavigate();
  return <TechnicianList onOpenPatient={(p) => navigate(`/technician/patient/${p.id}`, { state: { patient: p } })} />;
}

function TechnicianOverviewRoute() {
  const navigate = useNavigate();
  return (
    <TechnicianOverviewScreen
      onGoPatients={() => navigate("/technician")}
      onOpenPatient={(p) => navigate(`/technician/patient/${p.id}`, { state: { patient: p } })}
    />
  );
}

function TechnicianPatientRoute({ showToast }: { showToast: (m: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const statePatient = (location.state as { patient?: Patient } | null)?.patient;
  const [patient, setPatient] = useState<Patient | null>(statePatient ?? null);
  const [loading, setLoading] = useState(!statePatient);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (statePatient || !id) return;
    let cancelled = false;
    setLoading(true);
    fetchPatientById(id)
      .then((p) => { if (!cancelled) (p ? setPatient(p) : setNotFound(true)); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, statePatient]);

  if (notFound) return <Navigate to="/technician" replace />;
  if (loading || !patient) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-300/60 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <div className="flex-1 overflow-y-auto">
          <TechnicianPatientDetail
            patient={patient}
            onBack={() => navigate(-1)}
            onSaved={(msg) => { showToast(msg); navigate("/technician"); }}
          />
        </div>
      </div>
    </div>
  );
}

function CustomerCareListRoute() {
  const navigate = useNavigate();
  return <CustomerCareList onOpenPatient={(p) => navigate(`/customer-care/book/${p.id}`)} />;
}

function CustomerCareOverviewRoute() {
  const navigate = useNavigate();
  return (
    <CustomerCareOverviewScreen
      onGoBooking={() => navigate("/customer-care")}
      onOpenPatient={(p) => navigate(`/customer-care/book/${p.id}`)}
    />
  );
}

function CustomerCareBookRoute({ showToast }: { showToast: (m: string) => void }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchCarePatientById(id)
      .then((p) => { if (!cancelled) (p ? setPatient(p) : setNotFound(true)); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-300/60">
        <Loader2 size={28} className="animate-spin text-brand-600" />
      </div>
    );
  }

  if (notFound || !patient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-300/60">
        <div className="rounded-2xl bg-white px-5 py-4 text-[13.5px] text-slate-600 shadow-sm">
          Không tìm thấy khách.
          <button className="ml-3 font-bold text-brand-600" onClick={() => navigate(-1)}>Quay lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen justify-center bg-slate-300/60">
      <div className="relative flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <div className="flex-1 overflow-y-auto">
          <CustomerCareBook
            patient={patient}
            onBack={() => navigate(-1)}
            onSaved={showToast}
          />
        </div>
      </div>
    </div>
  );
}
