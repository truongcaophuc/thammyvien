// Gợi ý kịch bản gọi — query KB (Meilisearch RAG qua CEP) theo nhu cầu khách.
import { gql } from "./graphql";

export interface CallScriptHit {
  title: string;
  headingPath: string;
  chunkText: string;
  url: string;
  priceFromVnd: number | null;
  priceToVnd: number | null;
  score: number;
}

const CALL_SCRIPT_QUERY = `
  query CallScript($query: String!, $budgetMax: Int) {
    callScript(query: $query, budgetMax: $budgetMax) {
      title
      headingPath
      chunkText
      url
      priceFromVnd
      priceToVnd
      score
    }
  }
`;

export async function fetchCallScript(query: string, budgetMax?: number): Promise<CallScriptHit[]> {
  const data = await gql<{ callScript: CallScriptHit[] }>(CALL_SCRIPT_QUERY, {
    query,
    budgetMax: budgetMax ?? null,
  });
  return data.callScript;
}

// ===== Kịch bản AI (LLM sinh từ nhu cầu + KB) =====
export interface AiScriptStep {
  title: string;
  body: string;
  hint: string;
}
export interface AiCallScript {
  steps: AiScriptStep[];
  sources: string[];
  error: string | null;
}

const GENERATE_QUERY = `
  query GenerateCallScript($query: String!, $customerName: String, $customerContext: String, $budgetMax: Int) {
    generateCallScript(query: $query, customerName: $customerName, customerContext: $customerContext, budgetMax: $budgetMax) {
      steps { title body hint }
      sources
      error
    }
  }
`;

export async function generateCallScript(
  query: string,
  customerName?: string,
  customerContext?: string,
  budgetMax?: number,
): Promise<AiCallScript> {
  const data = await gql<{ generateCallScript: AiCallScript }>(GENERATE_QUERY, {
    query,
    customerName: customerName ?? null,
    customerContext: customerContext ?? null,
    budgetMax: budgetMax ?? null,
  });
  return data.generateCallScript;
}

// Cache theo lead (in-memory, sống suốt phiên) — giữ KB + kịch bản AI khi đóng/mở lại sheet.
const _kbCache = new Map<string, CallScriptHit[]>();
const _scriptCache = new Map<string, AiCallScript>();
export const callScriptCache = {
  getKb: (key: string) => _kbCache.get(key) ?? null,
  setKb: (key: string, v: CallScriptHit[]) => { _kbCache.set(key, v); },
  getScript: (key: string) => _scriptCache.get(key) ?? null,
  setScript: (key: string, v: AiCallScript) => { _scriptCache.set(key, v); },
};

/** Format giá gói VND gọn: 30.000.000 → "30 triệu" */
export function formatVnd(n: number | null): string {
  if (!n || n <= 0) return "";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)} triệu`;
  }
  return n.toLocaleString("vi-VN") + "đ";
}

/** Khoảng giá gói: "500.000đ" | "30–80 triệu" */
export function formatPriceRange(from: number | null, to: number | null): string {
  if (!from && !to) return "";
  if (from && to && from !== to) return `${formatVnd(from)} – ${formatVnd(to)}`;
  return formatVnd(from || to);
}
