import { useState } from "react";
import { LogIn, Loader2, User, Lock, AlertCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, type AgentProfile } from "../lib/auth";
import { ApiError } from "../lib/api";

export default function Login({ onLoggedIn }: { onLoggedIn: (u: AgentProfile) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Trang user vào trước khi bị redirect đến /login (vd /list) — sau khi auth quay lại đó.
  const fromPath = (location.state as { from?: string } | null)?.from ?? "/";

  const [userName, setUserName] = useState(() => localStorage.getItem("telesales:lastUser") ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const user = await login(userName.trim(), password);
      if (remember) localStorage.setItem("telesales:lastUser", userName.trim());
      else localStorage.removeItem("telesales:lastUser");
      onLoggedIn(user);
      navigate(fromPath, { replace: true });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-slate-300/60">
      <div className="relative flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef0f5] shadow-2xl">
        <div className="flex flex-1 flex-col px-6 pb-8 pt-12">
          {/* Logo / brand */}
          <div className="mb-10 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 shadow-soft">
              <LogIn size={28} className="text-white" />
            </div>
            <h1 className="text-[22px] font-extrabold text-slate-800">Telesales App</h1>
            <p className="mt-1 text-[13px] text-slate-500">Đăng nhập bằng tài khoản CEP</p>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {/* UserName */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                Tên đăng nhập
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-card focus-within:ring-2 focus-within:ring-brand-500">
                <User size={17} className="text-slate-400" />
                <input
                  autoFocus
                  autoComplete="username"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  placeholder="vd: nguyenthilan"
                  className="w-full bg-transparent text-[14.5px] text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                Mật khẩu
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-card focus-within:ring-2 focus-within:ring-brand-500">
                <Lock size={17} className="text-slate-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-transparent text-[14.5px] text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Remember me */}
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-[13.5px] text-slate-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Ghi nhớ tên đăng nhập
            </label>

            {/* Error */}
            {err && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !userName || !password}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 py-3.5 text-[15px] font-bold text-white shadow-soft transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={19} className="animate-spin" /> : <LogIn size={19} />}
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <div className="mt-auto pt-8 text-center text-[11.5px] text-slate-400">
            © 2026 Telesales App · v1.0
          </div>
        </div>
      </div>
    </div>
  );
}
