// Auth logic:
//   - login: POST /api/token → BE set HttpOnly cookie, trả về user profile
//   - logout: POST /api/token/logout → BE clear cookie
//   - checkSession: query GraphQL `me` → có user = đã login, null = chưa login
//
// Token KHÔNG nằm trong JS — chỉ trong cookie HttpOnly do BE quản lý.
// Profile cache trong localStorage CHỈ để show nhanh, source-of-truth luôn là BE.
import { api, ApiError } from "./api";
import { gql } from "./graphql";

export interface AgentProfile {
  Id?: string;
  UserName?: string;
  FullName?: string;
  Email?: string;
  PhoneNumber?: string;
  [k: string]: unknown;
}

interface LoginResponse {
  user: AgentProfile;
  expiresIn: number;
}

// Dùng localStorage để persist qua tab close (sessionStorage mất khi đóng tab).
const PROFILE_KEY = "telesales:profile";

export async function login(userName: string, password: string): Promise<AgentProfile> {
  const data = await api<LoginResponse>("/api/token", {
    method: "POST",
    body: { UserName: userName, Password: password },
    skipAuthRetry: true,
  });
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await api("/api/token/logout", { method: "POST", skipAuthRetry: true });
  } catch {
    // ignore — cookie sẽ bị clear bằng cách reload, hoặc đã expired
  }
  localStorage.removeItem(PROFILE_KEY);
}

/**
 * Verify session bằng cách query GraphQL `me`.
 * - Trả về user nếu cookie hợp lệ (refetch tươi từ BE, đồng bộ lại cache)
 * - Trả về null nếu chưa login / cookie expired
 *
 * KHÔNG phụ thuộc localStorage để xác định auth state — chỉ dựa BE.
 * Cách cũ phụ thuộc sessionStorage bị fail khi user mở tab mới (cookie còn nhưng
 * sessionStorage empty → tưởng logout).
 */
export async function checkSession(): Promise<AgentProfile | null> {
  try {
    const data = await gql<{ me: { id: string; userName: string; fullName: string; email?: string } | null }>(
      `{ me { id userName fullName email } }`,
    );
    if (!data.me) {
      localStorage.removeItem(PROFILE_KEY);
      return null;
    }
    const profile: AgentProfile = {
      Id: data.me.id,
      UserName: data.me.userName,
      FullName: data.me.fullName,
      Email: data.me.email,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      localStorage.removeItem(PROFILE_KEY);
      return null;
    }
    // Network error etc — không xoá cache, throw lên cho UI xử lý
    throw e;
  }
}

export function getCachedProfile(): AgentProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as AgentProfile) : null;
}
