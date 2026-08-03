import { gql } from "./graphql";
import type { Patient, Session } from "./dtv";
import type { ServerNotification } from "./notifications";

// CSKH xem READ-ONLY hồ sơ điều trị của khách (phác đồ tổng + lịch sử buổi + ảnh).
export interface CareTreatment {
  protocol: string;
  sessions: Session[];
}
const CARE_TREATMENT = `
  query CareTreatment($customerId: UUID!) {
    careTreatment(customerId: $customerId) {
      protocol
      sessions { appointmentId sessionNumber dateIso status source note photos skinSlug skinName skinColor }
    }
  }
`;
export async function fetchCareTreatment(customerId: string): Promise<CareTreatment> {
  const data = await gql<{ careTreatment: CareTreatment }>(CARE_TREATMENT, { customerId });
  return data.careTreatment;
}

// Chuông CSKH: khách vừa được ĐTV hoàn thành 1 buổi → cần đặt buổi kế.
const CSKH_NOTIFICATIONS = `
  query CskhNotifications {
    cskhNotifications { id type title body sentAt referenceId }
  }
`;
export async function fetchCskhNotifications(): Promise<ServerNotification[]> {
  const data = await gql<{ cskhNotifications: ServerNotification[] }>(CSKH_NOTIFICATIONS);
  return data.cskhNotifications;
}

const CARE_PATIENTS = `
  query CarePatients($search: String) {
    carePatients(search: $search) {
      id name phone service sessionDone sessionTotal lastCareAt protocol careStatus careStatusColor satisfaction satisfactionColor careIncident
    }
  }
`;

export async function fetchCarePatients(search?: string): Promise<Patient[]> {
  const data = await gql<{ carePatients: Patient[] }>(CARE_PATIENTS, { search: search?.trim() || null });
  return data.carePatients ?? [];
}

// ===== CV-13: Cập nhật trạng thái CSKH (care_status / skin_level / satisfaction) =====
export interface CareTagValue {
  slug: string;
  name: string;
  color?: string | null;
  metadata?: string | null; // jsonb cờ (isRiskFlag/isChurn/isComplain/isIncident...)
  current: boolean;
}
export interface CareTagGroup {
  groupSlug: string;
  groupName: string;
  singleSelect: boolean;
  current?: string | null;
  values: CareTagValue[];
}
const CARE_TAG_OPTIONS = `
  query CareTagOptions($customerId: UUID!) {
    careTagOptions(customerId: $customerId) {
      groupSlug groupName singleSelect current
      values { slug name color metadata current }
    }
  }
`;
export async function fetchCareTagOptions(customerId: string): Promise<CareTagGroup[]> {
  const data = await gql<{ careTagOptions: CareTagGroup[] }>(CARE_TAG_OPTIONS, { customerId });
  return data.careTagOptions ?? [];
}
const SET_CARE_TAG = `
  mutation SetCareTag($input: SetCareTagInput!) {
    setCareTag(input: $input) { success current currentName currentColor }
  }
`;
// appointmentId: chỉ truyền cho chiều skin_level (gắn theo buổi); các chiều khác bỏ trống (gắn theo liệu trình).
export async function setCareTag(
  customerId: string,
  groupSlug: string,
  valueSlug: string | null,
  appointmentId?: string | null,
) {
  const data = await gql<{ setCareTag: { success: boolean; current?: string | null; currentName?: string | null; currentColor?: string | null } }>(
    SET_CARE_TAG,
    { input: { customerId, groupSlug, valueSlug, appointmentId: appointmentId ?? null } }
  );
  return data.setCareTag;
}

// CV-20: tạo ticket complain khi CV chọn "Complain" ở Mức độ hài lòng.
const CREATE_COMPLAIN_TICKET = `
  mutation CreateComplainTicket($input: CreateComplainTicketInput!) {
    createComplainTicket(input: $input) { success ticketId status }
  }
`;
export async function createComplainTicket(input: {
  customerId: string;
  issue: string;
  severity?: string | null;
  wish?: string | null;
}): Promise<{ success: boolean; ticketId: string; status: string }> {
  const data = await gql<{ createComplainTicket: { success: boolean; ticketId: string; status: string } }>(
    CREATE_COMPLAIN_TICKET,
    { input: { customerId: input.customerId, issue: input.issue, severity: input.severity ?? null, wish: input.wish ?? null } },
  );
  return data.createComplainTicket;
}

// CV-13: bảng màu mức tình trạng da để render chip picker per-buổi.
const SKIN_LEVEL_VALUES = `
  query SkinLevelValues {
    skinLevelValues { slug name color metadata }
  }
`;
export async function fetchSkinLevelValues(): Promise<CareTagValue[]> {
  const data = await gql<{ skinLevelValues: CareTagValue[] }>(SKIN_LEVEL_VALUES);
  return (data.skinLevelValues ?? []).map((v) => ({ ...v, current: false }));
}

// ===== Tổng quan CSKH =====
export interface CskhOverview {
  agentName: string;
  activeCount: number;
  needBookCount: number;
  todayCount: number;
  thisWeekCount: number;
}
const CSKH_OVERVIEW = `
  query CskhOverview {
    cskhOverview { agentName activeCount needBookCount todayCount thisWeekCount }
  }
`;
export async function fetchCskhOverview(): Promise<CskhOverview> {
  const data = await gql<{ cskhOverview: CskhOverview }>(CSKH_OVERVIEW);
  return data.cskhOverview;
}

export async function fetchCarePatientById(id: string): Promise<Patient | null> {
  const all = await fetchCarePatients();
  return all.find((p) => p.id === id) ?? null;
}

const BOOK_NEXT_SESSION = `
  mutation BookNextTreatmentSession($input: BookNextTreatmentSessionInput!) {
    bookNextTreatmentSession(input: $input) {
      success
      appointmentId
      sessionNumber
      appointmentDate
    }
  }
`;

export async function bookNextTreatmentSession(input: {
  customerId: string;
  branchId: string;
  startAt: string;
}): Promise<{ success: boolean; appointmentId: string; sessionNumber: number; appointmentDate: string }> {
  const data = await gql<{ bookNextTreatmentSession: { success: boolean; appointmentId: string; sessionNumber: number; appointmentDate: string } }>(
    BOOK_NEXT_SESSION,
    { input },
  );
  return data.bookNextTreatmentSession;
}
