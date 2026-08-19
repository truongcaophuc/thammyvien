// ============================================================================
// Data layer workspace ĐTV (Điều trị viên / CSKH) — nối GraphQL CEP thật.
// Hybrid phác đồ theo BUỔI:
//   - myPatients:          khách ĐTV trực tiếp điều trị (scope theo buổi mình làm)
//   - saveTreatmentRecord: lưu PHÁC ĐỒ TỔNG của khách (text, cập nhật dần)
//   - patientSessions:     các BUỔI của khách + nhật ký + ảnh từng buổi
//   - saveSessionRecord:   lưu nhật ký + ảnh của 1 buổi
// Ảnh trả dataUri base64 qua GraphQL (như telesale leadSkinPhotos), gán thẳng <img src>.
// ============================================================================
import { gql } from "./graphql";
import type { ServerNotification } from "./notifications";

// Chuông ĐTV: khách vừa được tiếp tân check-in (bắt đầu điều trị).
const TREATMENT_NOTIFICATIONS = `
  query TreatmentNotifications {
    treatmentNotifications { id type title body sentAt referenceId }
  }
`;
export async function fetchTreatmentNotifications(): Promise<ServerNotification[]> {
  const data = await gql<{ treatmentNotifications: ServerNotification[] }>(TREATMENT_NOTIFICATIONS);
  return data.treatmentNotifications;
}

export interface Patient {
  id: string;            // = Customer.Id
  name: string;
  phone: string;
  service: string;       // liệu trình active
  sessionDone: number;
  sessionTotal: number;
  lastCareAt: string;    // ISO
  zaloGroupUrl?: string; // TODO mục 2
  qaScore?: number | null; // TODO mục 5
  needCareToday: boolean;  // TODO care-schedule
  protocol: string;        // phác đồ TỔNG (kế hoạch liệu trình)
  careStatus?: string | null;      // tag Tình trạng chăm sóc (care_status) — CSKH
  careStatusColor?: string | null; // màu hex của tag
  satisfaction?: string | null;      // tag Mức hài lòng (satisfaction)
  satisfactionColor?: string | null; // màu hex của tag
  careIncident?: boolean;             // CV-21: cờ Kích ứng/Sự cố → highlight
  // CV-23: nhịp chăm CV tự xác nhận (KHÁC lastCareAt — cái đó là ngày hẹn điều trị)
  lastInteractionAt?: string | null;
  daysSinceInteraction?: number;      // -1 = chưa từng tương tác
  interactedToday?: boolean;          // CV hiện tại đã tích hôm nay chưa (bất kỳ kênh nào)
  messagedToday?: boolean;            // đã tích kênh nhắn tin hôm nay
  calledToday?: boolean;              // đã tích kênh gọi điện hôm nay
  todayProofCount?: number;           // số ảnh minh chứng đã gửi hôm nay
  // CV-07/CV-08: giai đoạn chăm + độ trễ so với ngưỡng của giai đoạn.
  // null = không tính nhịp (khách đã bỏ liệu trình / ngừng chăm).
  carePhase?: string | null;
  carePhaseColor?: string | null;
  carePhaseSlug?: string | null;
  overdueDays?: number | null;        // <=0 còn hạn, >0 đang trễ
  // Hai chiều tự động: hạng khách theo giá gói và vòng đời theo buổi completed.
  tierSlug?: string | null;
  tierName?: string | null;
  tierColor?: string | null;
  lifecycleSlug?: string | null;
  lifecycleName?: string | null;
  lifecycleColor?: string | null;
  // Chốt gói + công nợ (gắn ở liệu trình active).
  dealStatus?: string | null;         // closed | open | null (chưa đánh giá)
  packagePrice?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  nextPaymentDate?: string | null;
  hasDebt?: boolean;
  // Trạng thái thanh toán = tag debt_status Trợ lý gán tay (nguồn hiển thị chip).
  debtTagSlug?: string | null;
  debtTagName?: string | null;
  debtTagColor?: string | null;
  careAgentId?: string | null;
  careAgentName?: string | null;
  // Mốc sắp xếp (VIP → vừa cập nhật → ngày tới khám).
  lastUpdatedAt?: string | null;
  nextAppointmentAt?: string | null;
}

export interface Session {
  appointmentId: string;
  sessionNumber: number | null;
  dateIso: string;
  status: string;        // pending|confirmed|checked_in|completed|cancelled|no_show|...
  source: string;        // telesale|customer_care|walkin|system|self_service
  note: string;          // nhật ký buổi
  photos: string[];      // dataUri base64
  photoIds?: string[];   // CV-14: id ảnh cùng thứ tự photos (để CSKH xoá)
  skinSlug?: string | null;   // CV-13: tình trạng da của buổi này
  skinName?: string | null;
  skinColor?: string | null;
  doctorId?: string | null;   // CV-15: bác sĩ CSKH tick khi book
  doctorName?: string | null;
  therapistName?: string | null; // CV-14: ĐTV đã làm buổi (CSKH chỉ xem)
}

export interface TreatmentPhotoInput {
  fileName: string;
  base64: string;
}

const MY_PATIENTS = `
  query MyPatients {
    myPatients {
      id name phone service sessionDone sessionTotal lastCareAt
      zaloGroupUrl qaScore needCareToday protocol
      tierSlug tierName tierColor lifecycleSlug lifecycleName lifecycleColor
      dealStatus packagePrice paidAmount debtAmount nextPaymentDate hasDebt
      debtTagSlug debtTagName debtTagColor
      careAgentId careAgentName
      lastUpdatedAt nextAppointmentAt
    }
  }
`;

// ===== Tổng quan Trợ lý — 4 ô bám công việc trong NGÀY (không phải tiến độ điều trị) =====
export interface TechnicianOverview {
  agentName: string;
  needConsultCount: number;      // tổng khách có lịch hôm nay
  closedCount: number;           // trong số đó, đã chốt gói
  awaitingPaymentCount: number;  // liệu trình active còn nợ
  needRoomCount: number;         // lịch hôm nay chưa gán phòng
}
const TECHNICIAN_OVERVIEW = `
  query TechnicianOverview {
    technicianOverview { agentName needConsultCount closedCount awaitingPaymentCount needRoomCount }
  }
`;
export async function fetchTechnicianOverview(): Promise<TechnicianOverview> {
  const data = await gql<{ technicianOverview: TechnicianOverview }>(TECHNICIAN_OVERVIEW);
  return data.technicianOverview;
}

export async function fetchMyPatients(): Promise<Patient[]> {
  const data = await gql<{ myPatients: Patient[] }>(MY_PATIENTS);
  return data.myPatients;
}

// Các buổi của khách + nhật ký + ảnh từng buổi.
const PATIENT_SESSIONS = `
  query PatientSessions($customerId: UUID!) {
    patientSessions(customerId: $customerId) {
      appointmentId sessionNumber dateIso status source note photos
    }
  }
`;

export async function fetchPatientSessions(customerId: string): Promise<Session[]> {
  const data = await gql<{ patientSessions: Session[] }>(PATIENT_SESSIONS, { customerId });
  return data.patientSessions ?? [];
}

// ---- Tab Lịch hẹn (agenda theo ngày) ----
export interface TechnicianAppointment {
  appointmentId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  startAtIso: string;
  status: string;        // pending|confirmed|arrived|checked_in|completed|cancelled|no_show
  source: string;
  sessionNumber: number | null;
  sessionTotal: number;
  serviceName: string;
  branchName: string;
  therapistName?: string | null;
  doctorName?: string | null;
  resources: AppointmentResource[];
  // Hai chiều tự động: hạng khách và vòng đời.
  tierSlug?: string | null;
  tierName?: string | null;
  tierColor?: string | null;
  lifecycleSlug?: string | null;
  lifecycleName?: string | null;
  lifecycleColor?: string | null;
}

export interface AppointmentResource {
  resourceId: string;
  resourceName: string;
  resourceTypeName: string;
  resourceTypeSlug: string;
  role: string;
  allocationStatus: string;
}

const TECHNICIAN_APPOINTMENTS = `
  query TechnicianAppointments($fromDate: String!, $toDate: String!) {
    technicianAppointments(fromDate: $fromDate, toDate: $toDate) {
      appointmentId customerId customerName customerPhone startAtIso status source
      sessionNumber sessionTotal serviceName branchName therapistName doctorName
      resources { resourceId resourceName resourceTypeName resourceTypeSlug role allocationStatus }
      tierSlug tierName tierColor lifecycleSlug lifecycleName lifecycleColor
    }
  }
`;

const TECHNICIAN_APPOINTMENTS_LEGACY = `
  query TechnicianAppointments($fromDate: String!, $toDate: String!) {
    technicianAppointments(fromDate: $fromDate, toDate: $toDate) {
      appointmentId customerId customerName customerPhone startAtIso status source
      sessionNumber sessionTotal serviceName branchName therapistName doctorName
      tierSlug tierName tierColor lifecycleSlug lifecycleName lifecycleColor
    }
  }
`;

/** fromDate/toDate: yyyy-MM-dd, bao cả 2 đầu. */
export async function fetchTechnicianAppointments(
  fromDate: string,
  toDate: string,
): Promise<TechnicianAppointment[]> {
  try {
    const data = await gql<{ technicianAppointments: TechnicianAppointment[] }>(
      TECHNICIAN_APPOINTMENTS,
      { fromDate, toDate },
    );
    return (data.technicianAppointments ?? []).map((a) => ({ ...a, resources: a.resources ?? [] }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("resources")) throw e;
    const data = await gql<{ technicianAppointments: Array<Omit<TechnicianAppointment, "resources">> }>(
      TECHNICIAN_APPOINTMENTS_LEGACY,
      { fromDate, toDate },
    );
    return (data.technicianAppointments ?? []).map((a) => ({ ...a, resources: [] }));
  }
}

export async function fetchPatientById(id: string): Promise<Patient | null> {
  const list = await fetchMyPatients();
  return list.find((p) => p.id === id) ?? null;
}

const SAVE_TREATMENT = `
  mutation SaveTreatment($input: SaveTreatmentRecordInput!) {
    saveTreatmentRecord(input: $input) { success }
  }
`;

// Lưu PHÁC ĐỒ TỔNG của khách (text) + kết quả chốt gói/công nợ.
// dealStatus='closed' là cầu duy nhất đẩy hồ sơ sang pool CSKH; 'open' đẩy ngược về Telesale.
// Trường bỏ trống = không đổi, nên các màn cũ gọi { customerId, protocol } vẫn chạy y như trước.
export async function saveTreatmentRecord(input: {
  customerId: string;
  protocol: string;
  dealStatus?: "closed" | "open" | null;
  dealNote?: string;
  recordings?: TreatmentPhotoInput[];
  serviceName?: string;
  totalSessions?: number | null;
  packagePrice?: number | null;
  paidAmount?: number | null;
  debtAmount?: number | null;
  nextPaymentDate?: string | null;
}): Promise<{ success: boolean }> {
  const data = await gql<{ saveTreatmentRecord: { success: boolean } }>(
    SAVE_TREATMENT,
    { input: { ...input, protocol: input.protocol } },
  );
  return { success: data.saveTreatmentRecord.success };
}

const PATIENT_RECORDINGS = `
  query PatientRecordings($customerId: UUID!) {
    patientRecordings(customerId: $customerId)
  }
`;

// Ghi âm buổi tư vấn đã lưu — dataUri base64, gán thẳng <audio src>.
export async function fetchPatientRecordings(customerId: string): Promise<string[]> {
  const data = await gql<{ patientRecordings: string[] }>(PATIENT_RECORDINGS, { customerId });
  return data.patientRecordings ?? [];
}

const COMPLETE_TREATMENT = `
  mutation CompleteTreatment($customerId: UUID!) {
    completeTreatmentCourse(customerId: $customerId) { success }
  }
`;

// Đánh dấu HOÀN THÀNH liệu trình → khách rời danh sách "đang điều trị".
export async function completeTreatmentCourse(customerId: string): Promise<boolean> {
  const data = await gql<{ completeTreatmentCourse: { success: boolean } }>(
    COMPLETE_TREATMENT,
    { customerId },
  );
  return data.completeTreatmentCourse.success;
}

const COMPLETE_SESSION = `
  mutation CompleteSession($appointmentId: UUID!) {
    completeSession(appointmentId: $appointmentId) { success error status }
  }
`;

// Hoàn thành 1 BUỔI (checked_in → completed) — giống nút ở màn Lịch hẹn.
export async function completeSession(appointmentId: string): Promise<{ success: boolean; error: string; status: string }> {
  const data = await gql<{ completeSession: { success: boolean; error: string; status: string } }>(
    COMPLETE_SESSION,
    { appointmentId },
  );
  return data.completeSession;
}

const SAVE_SESSION = `
  mutation SaveSession($input: SaveSessionRecordInput!) {
    saveSessionRecord(input: $input) { success photos }
  }
`;

// Lưu nhật ký + APPEND ảnh của 1 buổi. Trả toàn bộ ảnh buổi sau khi lưu (dataUri).
export async function saveSessionRecord(input: {
  appointmentId: string;
  note: string;
  photos: TreatmentPhotoInput[];
}): Promise<{ success: boolean; photos: string[] }> {
  const data = await gql<{ saveSessionRecord: { success: boolean; photos: string[] } }>(
    SAVE_SESSION,
    { input: { appointmentId: input.appointmentId, note: input.note, photos: input.photos } },
  );
  const r = data.saveSessionRecord;
  return { success: r.success, photos: r.photos || [] };
}

// Đọc 1 File (image) -> base64 (bỏ prefix data:) cho mutation.
export function fileToBase64(file: File): Promise<{ fileName: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const comma = res.indexOf(",");
      resolve({ fileName: file.name || "photo.jpg", base64: comma >= 0 ? res.slice(comma + 1) : res });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
