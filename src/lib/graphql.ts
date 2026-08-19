// Lightweight GraphQL client — fetch wrapper, không cần Apollo/urql.
// Cookie tự gửi qua credentials: 'include' nhờ HttpOnly cookie BE set.
import { api, refreshAuthSession } from "./api";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: (string | number)[]; extensions?: { code?: string } }>;
}

// Backend ném mã này khi phiên hết hạn. Khớp theo MÃ chứ không theo nội dung thông báo —
// đổi câu chữ tiếng Việt sẽ không làm hỏng việc nhận diện.
const UNAUTHENTICATED = "UNAUTHENTICATED";

/**
 * Phiên hết hạn -> đưa thẳng về trang đăng nhập.
 * Trước đây backend trả rỗng thay vì báo lỗi, nên app vẽ ra màn hình toàn số 0
 * và người dùng phải tự đoán là phải tải lại trang.
 */
function goLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return; // tránh lặp vô hạn
  window.location.replace("/login");
}

/**
 * Gửi query/mutation tới /graphql endpoint.
 * Throw nếu response có errors hoặc HTTP fail.
 */
export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const request = () => api<GraphQLResponse<T>>("/graphql", {
    method: "POST",
    body: { query, variables },
  });

  let res = await request();

  if (res.errors && res.errors.length > 0) {
    if (res.errors.some((e) => e.extensions?.code === UNAUTHENTICATED)) {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        res = await request();
        if (!res.errors || res.errors.length === 0) {
          if (!res.data) throw new Error("GraphQL response không có data");
          return res.data;
        }
      }
      goLogin();
      throw new Error("Phiên đăng nhập đã hết hạn");
    }
    const msg = res.errors.map((e) => e.message).join("; ");
    throw new Error(`GraphQL error: ${msg}`);
  }

  if (!res.data) {
    throw new Error("GraphQL response không có data");
  }

  return res.data;
}
