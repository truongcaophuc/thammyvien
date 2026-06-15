// Pure type definitions cho telesales-app.
// Toàn bộ runtime data lấy từ CEP qua GraphQL — xem `src/lib/{leads,overview,profile}.ts`.

export type LeadStatus = "new" | "overdue" | "callback" | "scheduled" | "closed";

export interface CallHistory {
  time: string;
  result: string;
  tone?: "neutral" | "warning" | "success";
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string; // nguồn: trang Facebook, Zalo...
  need: string; // nhu cầu
  note: string; // ghi chú
  receivedAt: string;
  status: LeadStatus;
  badge?: string; // nhãn phụ hiển thị trên card
  subtitle?: string; // dòng phụ
  history: CallHistory[];
}

export interface Appointment {
  id: string;
  name: string;
  date: string; // dd/MM
  time: string;
  note: string;
}

export interface ScriptStep {
  key: string;
  title: string;
  body: string;
  hint?: string;
}

// Khớp với enum CallResultKey của BE GraphQL.
// FE render label tiếng Việt — xem `resultOptions` trong LeadDetail.
// Bỏ INTERESTED (merge với CALLBACK) để workflow agent đơn giản hơn.
export type ResultKey =
  | "WRONG_NUMBER"
  | "REJECTED"
  | "CALLBACK"
  | "BOOKED";

export interface DayOption {
  key: string;
  label: string;
  date: string;
}

export interface Slot {
  time: string;
  booked: number;
}
