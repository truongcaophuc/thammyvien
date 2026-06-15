// Lead data fetching từ CEP qua GraphQL.
// BE trả raw data (status enum UPPERCASE + ISO date + history).
// FE format badge/subtitle/receivedAt/history time sang tiếng Việt.
import { gql } from "./graphql";
import type { CallHistory, Lead, LeadStatus } from "../data";

type ServerStatus = "NEW" | "OVERDUE" | "CALLBACK" | "SCHEDULED" | "CLOSED";

interface ServerCallHistory {
  id: string;
  calledAt: string; // ISO
  result: string;
  notes: string;
  resultCode: string; // C1b/C2/C5/F1/F4...
}

interface MyLeadsResponse {
  myLeads: Array<{
    id: string;
    name: string;
    phone: string;
    source: string;
    note: string;
    status: ServerStatus;
    receivedAt: string; // ISO 8601
    history: ServerCallHistory[];
  }>;
}

const MY_LEADS_QUERY = `
  query MyLeads {
    myLeads {
      id
      name
      phone
      source
      note
      status
      receivedAt
      history {
        id
        calledAt
        result
        notes
        resultCode
      }
    }
  }
`;

export async function fetchMyLeads(): Promise<Lead[]> {
  const data = await gql<MyLeadsResponse>(MY_LEADS_QUERY);
  return data.myLeads.map((l) => {
    const status = mapStatus(l.status);
    const received = new Date(l.receivedAt);
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source,
      need: extractNeed(l.note),
      note: l.note,
      receivedAt: formatReceivedAt(received),
      status,
      badge: badgeOf(status),
      subtitle: subtitleOf(status, received),
      history: l.history.map(mapCallHistory),
    };
  });
}

// Map raw ContactCall → display history. Tone visual theo result code:
// Cx (Contacted) family = neutral/success, Fx (Failed) = warning.
function mapCallHistory(h: ServerCallHistory): CallHistory {
  return {
    time: formatRelative(new Date(h.calledAt)),
    result: h.notes && h.notes.trim().length > 0 ? h.notes : h.result,
    tone: toneOfResultCode(h.resultCode),
  };
}

function toneOfResultCode(code: string): "neutral" | "warning" | "success" {
  if (!code) return "neutral";
  // F* family = Failed / negative outcome → warning
  if (code.toUpperCase().startsWith("F")) return "warning";
  // C5 SUBMITTED + 02/03 success codes
  if (code === "C5" || code === "02" || code === "03") return "success";
  // C1*/C2/C3/C4 = contacted but no closure → neutral
  return "neutral";
}

// ===== Helpers — convert raw BE data → UI display strings =====

function mapStatus(s: ServerStatus): LeadStatus {
  switch (s) {
    case "NEW":
      return "new";
    case "OVERDUE":
      return "overdue";
    case "CALLBACK":
      return "callback";
    case "SCHEDULED":
      return "scheduled";
    case "CLOSED":
      return "closed";
    default:
      return "new";
  }
}

function badgeOf(status: LeadStatus): string {
  switch (status) {
    case "overdue":
      return "Quá hạn";
    case "callback":
      return "Gọi lại";
    case "scheduled":
      return "Đã đặt lịch";
    case "closed":
      return "Đã đóng";
    case "new":
    default:
      return "Mới";
  }
}

function subtitleOf(status: LeadStatus, receivedAt: Date): string {
  const rel = formatRelative(receivedAt);
  switch (status) {
    case "overdue":
      return "Lead về hôm qua – chưa gọi";
    case "callback":
      return "Hẹn gọi lại – họp xong gọi 10:30";
    case "scheduled":
      return "Đã đặt lịch hẹn";
    case "closed":
      return "Đã đóng — không cần gọi lại";
    case "new":
    default:
      return `Lead mới · ${rel}`;
  }
}

function formatRelative(d: Date): string {
  const delta = (Date.now() - d.getTime()) / 1000;
  if (delta < 60) return "vừa xong";
  if (delta < 3600) return `${Math.floor(delta / 60)} phút trước`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} giờ trước`;
  if (delta < 172800) return "Hôm qua";
  return d.toLocaleDateString("vi-VN");
}

function formatReceivedAt(d: Date): string {
  const hours = (Date.now() - d.getTime()) / 3600000;
  if (hours < 12) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm} hôm nay`;
  }
  return formatRelative(d);
}

function extractNeed(note: string): string {
  if (!note) return "";
  const firstSentence = note.split(/[.!?]/, 1)[0]?.trim();
  return firstSentence || note.slice(0, 60);
}
