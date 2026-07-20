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
    need: string | null; // nhu cầu từ intake (Prospect.AdditionalJsonData.source.need); null nếu lead không qua form
    status: ServerStatus;
    receivedAt: string; // ISO 8601
    callbackSource: string; // "telesale" | "reception" | "" — nguồn của trạng thái Gọi lại
    callbackReason: string; // lý do (chủ yếu khi reception hủy lịch trả về)
    isInterested: boolean; // cờ "Quan tâm / đang cân nhắc" (BE: Prospect.IsInterested, đổi tên từ isHot)
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
      need
      status
      receivedAt
      callbackSource
      callbackReason
      isInterested
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
      need: l.need && l.need.trim() ? l.need.trim() : extractNeed(l.note),
      note: l.note,
      receivedAt: formatReceivedAt(received),
      status,
      badge: badgeOf(status),
      subtitle: subtitleOf(status, received),
      callbackSource: (l.callbackSource || "") as Lead["callbackSource"],
      callbackReason: l.callbackReason || "",
      isInterested: !!l.isInterested,
      history: l.history.map(mapCallHistory),
    };
  });
}

// Hỗ trợ deep-link (noti/push → /lead/:id): tìm 1 lead theo id trong bucket của agent.
export async function fetchLeadById(id: string): Promise<Lead | null> {
  const leads = await fetchMyLeads();
  return leads.find((l) => l.id === id) ?? null;
}

// Bật/tắt cờ "Quan tâm / đang cân nhắc" (warm lead) cho 1 lead.
const SET_INTERESTED_MUTATION = `
  mutation SetLeadInterested($leadId: UUID!, $interested: Boolean!) {
    setLeadInterested(leadId: $leadId, interested: $interested)
  }
`;
export async function setLeadInterested(leadId: string, interested: boolean): Promise<boolean> {
  const data = await gql<{ setLeadInterested: boolean }>(SET_INTERESTED_MUTATION, { leadId, interested });
  return data.setLeadInterested;
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

// ===== Hồ sơ ĐẦY ĐỦ của lead (card "Thông tin khách" trên LeadDetail) =====
// Đồng bộ dữ liệu với modal thẻ khách bên CEP: thông tin cơ bản + thuộc tính DynamicForm.
export interface LeadAttribute {
  label: string;
  value: string;
}
export interface LeadProfile {
  phone: string;
  phone2: string;
  dob: string;      // dd/MM/yyyy (BE format sẵn)
  email: string;
  address: string;
  job: string;
  attributes: LeadAttribute[];
}

const LEAD_PROFILE_QUERY = `
  query LeadProfile($id: UUID!) {
    leadProfile(leadId: $id) {
      phone phone2 dob email address job
      attributes { label value }
    }
  }
`;

export async function fetchLeadProfile(leadId: string): Promise<LeadProfile | null> {
  const data = await gql<{ leadProfile: LeadProfile | null }>(LEAD_PROFILE_QUERY, { id: leadId });
  return data.leadProfile;
}

// ===== Ảnh da khách gửi kèm intake form (card "Ảnh khách gửi" trên LeadDetail) =====
// dataUri = data:image/...;base64,... → gán thẳng vào <img src>. BE chỉ trả ảnh của lead
// đang do agent hiện tại phụ trách (bảo mật server-side).
export interface SkinPhoto {
  id: string;
  fileName: string;
  dataUri: string;
}

const LEAD_SKIN_PHOTOS_QUERY = `
  query LeadSkinPhotos($id: UUID!) {
    leadSkinPhotos(leadId: $id) {
      id fileName dataUri
    }
  }
`;

export async function fetchLeadSkinPhotos(leadId: string): Promise<SkinPhoto[]> {
  const data = await gql<{ leadSkinPhotos: SkinPhoto[] }>(LEAD_SKIN_PHOTOS_QUERY, { id: leadId });
  return data.leadSkinPhotos ?? [];
}
