// Lightweight GraphQL client — fetch wrapper, không cần Apollo/urql.
// Cookie tự gửi qua credentials: 'include' nhờ HttpOnly cookie BE set.
import { api } from "./api";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: (string | number)[] }>;
}

/**
 * Gửi query/mutation tới /graphql endpoint.
 * Throw nếu response có errors hoặc HTTP fail.
 */
export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await api<GraphQLResponse<T>>("/graphql", {
    method: "POST",
    body: { query, variables },
  });

  if (res.errors && res.errors.length > 0) {
    const msg = res.errors.map((e) => e.message).join("; ");
    throw new Error(`GraphQL error: ${msg}`);
  }

  if (!res.data) {
    throw new Error("GraphQL response không có data");
  }

  return res.data;
}
