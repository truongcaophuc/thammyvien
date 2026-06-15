// Fetch wrapper:
//   - Tự đính cookie qua credentials: "include" (browser handle)
//   - Tự retry 1 lần khi 401: gọi /api/token/refresh rồi retry request gốc
//   - Throw ApiError với message tiếng Việt để UI hiển thị
import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // Single-flight: nhiều request 401 đồng thời chỉ refresh 1 lần
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/token/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Reset sau 1 tick để các request đồng thời cùng share
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();

  return refreshInFlight;
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  skipAuthRetry?: boolean;
};

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, headers, skipAuthRetry, ...rest } = opts;

  const init: RequestInit = {
    ...rest,
    credentials: "include", // gửi/nhận cookie HttpOnly
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  };

  if (body !== undefined) init.body = JSON.stringify(body);

  let res = await fetch(`${API_BASE_URL}${path}`, init);

  // 401 → thử refresh 1 lần rồi retry. Bỏ qua nếu chính endpoint refresh/login.
  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(`${API_BASE_URL}${path}`, init);
    }
  }

  // Parse body trước khi check status để error có data
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "Message" in parsed && typeof (parsed as { Message: unknown }).Message === "string"
        ? (parsed as { Message: string }).Message
        : null) ?? `Lỗi ${res.status}`;
    throw new ApiError(res.status, msg, parsed);
  }

  return parsed as T;
}
