import { gql } from "./graphql";
import type { Patient, Session } from "./technician";
import type { ServerNotification } from "./notifications";

// CSKH xem READ-ONLY hồ sơ điều trị của khách (phác đồ điều trị + lịch sử buổi + ảnh).
export interface CareTreatment {
  protocol: string;
  sessions: Session[];
  proofPhotos: string[];   // ảnh minh chứng lượt chăm hôm nay của CV đang xem
  // Note CSKH theo LIỆU TRÌNH (mua gói mới → note mới). Cùng ô với màn CEP.
  cskhNote: string;
  cskhNoteBy: string;
  cskhNoteAt: string;
  // Gói & công nợ + ghi âm tư vấn Trợ lý bàn giao — CSKH chỉ xem.
  packagePrice: number | null;
  paidAmount: number | null;
  debtAmount: number | null;
  nextPaymentDate: string;
  purchaseDate: string;
  dealNote: string;
  recordings: string[];
}
const CARE_TREATMENT = `
  query CareTreatment($customerId: UUID!) {
    careTreatment(customerId: $customerId) {
      protocol
      proofPhotos
      cskhNote cskhNoteBy cskhNoteAt
      packagePrice paidAmount debtAmount nextPaymentDate purchaseDate dealNote recordings
      sessions { appointmentId sessionNumber dateIso status source note photos photoIds skinSlug skinName skinColor doctorId doctorName therapistName }
    }
  }
`;
export async function fetchCareTreatment(customerId: string): Promise<CareTreatment> {
  const data = await gql<{ careTreatment: CareTreatment }>(CARE_TREATMENT, { customerId });
  return data.careTreatment;
}

// Chuông CSKH: khách vừa được ĐTV hoàn thành 1 buổi → cần đặt buổi kế.
const CUSTOMER_CARE_NOTIFICATIONS = `
  query CustomerCareNotifications {
    customerCareNotifications { id type title body sentAt referenceId }
  }
`;
export async function fetchCustomerCareNotifications(): Promise<ServerNotification[]> {
  const data = await gql<{ customerCareNotifications: ServerNotification[] }>(CUSTOMER_CARE_NOTIFICATIONS);
  return data.customerCareNotifications;
}

const CARE_PATIENTS = `
  query CarePatients($search: String) {
    carePatients(search: $search) {
      id name phone service sessionDone sessionTotal lastCareAt protocol careStatus careStatusColor satisfaction satisfactionColor careIncident
      lastInteractionAt daysSinceInteraction interactedToday messagedToday calledToday todayProofCount
      carePhase carePhaseColor carePhaseSlug overdueDays lastUpdatedAt
      tierSlug tierName tierColor lifecycleSlug lifecycleName lifecycleColor
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

// Lưu note CSKH của liệu trình đang chạy (BE tự tìm course active của khách).
const SAVE_CSKH_NOTE = `
  mutation SaveCskhNote($customerId: UUID!, $note: String!) {
    saveCskhNote(customerId: $customerId, note: $note) { success }
  }
`;
export async function saveCskhNote(customerId: string, note: string): Promise<boolean> {
  const data = await gql<{ saveCskhNote: { success: boolean } }>(SAVE_CSKH_NOTE, { customerId, note });
  return data.saveCskhNote.success;
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

// ===== CV-07: giai đoạn trong "guồng" chăm sóc =====
// Tải riêng vì đây là dữ liệu dùng chung: cho thứ tự sắp xếp danh sách việc, và cho phép
// dựng đủ chip lọc kể cả giai đoạn đang không có khách nào (gom từ danh sách khách thì mất).
export interface CareRhythmPhase {
  id: string;
  name: string;
  slug: string;
  scope: string;
  thresholdDays: number;
  color?: string | null;
  displayOrder: number;
}
const CARE_RHYTHM_PHASES = `
  query CareRhythmPhases {
    careRhythmPhases { id name slug scope thresholdDays color displayOrder }
  }
`;
export async function fetchCareRhythmPhases(): Promise<CareRhythmPhase[]> {
  const data = await gql<{ careRhythmPhases: CareRhythmPhase[] }>(CARE_RHYTHM_PHASES);
  return data.careRhythmPhases ?? [];
}

// ===== CV-23: CV tự tích "đã nhắn/gọi khách hôm nay" =====
// Không đọc được Zalo cá nhân (NT3) nên nhịp chăm đo bằng việc CV tự xác nhận.
export interface CareInteractionResult {
  success: boolean;
  interactedToday: boolean;      // trạng thái SAU khi bấm
  lastInteractionAt: string | null;
  daysSinceInteraction: number;  // -1 = chưa từng
  photos: string[];              // ảnh minh chứng của lượt hôm nay (data: URI)
  photoIds: string[];
}
const LOG_CARE_INTERACTION = `
  mutation LogCareInteraction($input: LogCareInteractionInput!) {
    logCareInteraction(input: $input) { success interactedToday lastInteractionAt daysSinceInteraction photos photoIds }
  }
`;
/**
 * Tích/bỏ tích tương tác hôm nay với 1 khách (bấm lại trong ngày = bỏ tích).
 * Gửi kèm `photos` khi đã tích = BỔ SUNG ảnh minh chứng, không bỏ tích.
 */
export async function logCareInteraction(
  customerId: string,
  channel?: "manual" | "message" | "call",
  note?: string | null,
  photos?: TreatmentPhoto[] | null,
): Promise<CareInteractionResult> {
  const data = await gql<{ logCareInteraction: CareInteractionResult }>(LOG_CARE_INTERACTION, {
    input: {
      customerId,
      channel: channel ?? "manual",
      note: note ?? null,
      photos: photos?.length ? photos : null,
    },
  });
  return data.logCareInteraction;
}

// ===== CV-14: CSKH sửa thông tin buổi =====
export interface CareSessionResult {
  success: boolean;
  appointmentId: string;
  sessionNumber: number | null;
  photos: string[];
  photoIds: string[];
}
export interface TreatmentPhoto {
  fileName: string;
  base64: string;
}

const UPDATE_CARE_SESSION = `
  mutation UpdateCareSession($input: UpdateCareSessionInput!) {
    updateCareSession(input: $input) { success appointmentId sessionNumber photos photoIds }
  }
`;
// Trường bỏ trống = KHÔNG đổi. therapistResourceId/doctorResourceId = chuỗi Guid rỗng = gỡ gán.
export const UNASSIGN = "00000000-0000-0000-0000-000000000000";
export async function updateCareSession(input: {
  appointmentId: string;
  startAt?: string | null;
  therapistResourceId?: string | null;
  doctorResourceId?: string | null;
  note?: string | null;
  photos?: TreatmentPhoto[] | null;
  removePhotoIds?: string[] | null;
}): Promise<CareSessionResult> {
  const data = await gql<{ updateCareSession: CareSessionResult }>(UPDATE_CARE_SESSION, { input });
  return data.updateCareSession;
}


// ===== Tổng quan CSKH =====
export interface CustomerCareOverview {
  agentName: string;
  activeCount: number;
  needBookCount: number;
  todayCount: number;
  thisWeekCount: number;
}
const CUSTOMER_CARE_OVERVIEW = `
  query CustomerCareOverview {
    customerCareOverview { agentName activeCount needBookCount todayCount thisWeekCount }
  }
`;
export async function fetchCustomerCareOverview(): Promise<CustomerCareOverview> {
  const data = await gql<{ customerCareOverview: CustomerCareOverview }>(CUSTOMER_CARE_OVERVIEW);
  return data.customerCareOverview;
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
  doctorResourceId?: string | null; // CV-15: bác sĩ CSKH tick; bỏ trống = không gán
}): Promise<{ success: boolean; appointmentId: string; sessionNumber: number; appointmentDate: string }> {
  const data = await gql<{ bookNextTreatmentSession: { success: boolean; appointmentId: string; sessionNumber: number; appointmentDate: string } }>(
    BOOK_NEXT_SESSION,
    { input: { ...input, doctorResourceId: input.doctorResourceId ?? null } },
  );
  return data.bookNextTreatmentSession;
}
