// Dashboard "Tổng quan" — fetch từ CEP GraphQL.
import { gql } from "./graphql";

export interface OverviewAppointment {
  id: string;
  customerName: string;
  phone: string;
  meetDate: string; // ISO 8601
  notes: string;
}

export interface Overview {
  agentName: string;
  agentRole: string;
  today: string; // ISO 8601
  toCallCount: number;
  calledTodayCount: number;
  // Đổi từ callbackCount → overdueCount. "Quá hạn" = lead status=overdue.
  // Actionable hơn callback (Cần gọi đã bao gồm callback hôm nay).
  // TODO BE: rename field `callbackCount` → `overdueCount` trong resolver MyOverview.
  overdueCount: number;
  appointmentCount: number;
  progressDone: number;
  progressTotal: number;
  upcomingAppointments: OverviewAppointment[];
}

const OVERVIEW_QUERY = `
  query MyOverview {
    myOverview {
      agentName
      agentRole
      today
      toCallCount
      calledTodayCount
      overdueCount
      appointmentCount
      progressDone
      progressTotal
      upcomingAppointments {
        id
        customerName
        phone
        meetDate
        notes
      }
    }
  }
`;

export async function fetchOverview(): Promise<Overview> {
  const data = await gql<{ myOverview: Overview }>(OVERVIEW_QUERY);
  return data.myOverview;
}

// ===== Helpers — render UI strings từ raw data =====

const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const WEEKDAYS_SHORT_VI = ["CN", "T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy"];

/** "Thứ Năm, 05 tháng 6 · 2026" */
export function formatToday(iso: string): string {
  const d = new Date(iso);
  const wd = WEEKDAYS_VI[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${wd}, ${dd} tháng ${d.getMonth() + 1} · ${d.getFullYear()}`;
}

/** { date: "07/06", time: "14:00", dayLabel: "Hôm nay"|"Mai"|"T.Bảy"|"" } */
export function formatAppointment(a: OverviewAppointment) {
  const d = new Date(a.meetDate);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return {
    date: `${dd}/${mm}`,
    time: `${hh}:${mi}`,
    dayLabel: relativeDayLabel(d),
  };
}

/** Relative day label cho appointment.
 *  - Hôm nay / Mai / Hôm qua nếu sát ngày hiện tại
 *  - Tên thứ ngắn (T.Bảy, CN) nếu trong tuần
 *  - "" nếu xa hơn → caller fallback DD/MM */
export function relativeDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Mai";
  if (diffDays === -1) return "Hôm qua";
  if (Math.abs(diffDays) <= 6) return WEEKDAYS_SHORT_VI[date.getDay()];
  return "";
}
