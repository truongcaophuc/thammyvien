// Availability lịch-hẹn-đến (arrival-slot) từ CEP Calendar module qua GraphQL.
import { gql } from "./graphql";

export interface ArrivalSlot {
  startAt: string; // ISO datetime của khung giờ
  booked: number;
  capacity: number;
  available: number;
  isPast: boolean;
}

const ARRIVAL_AVAILABILITY_QUERY = `
  query ArrivalAvailability($date: String!, $branchId: UUID) {
    calendarArrivalAvailability(date: $date, branchId: $branchId) {
      startAt
      booked
      capacity
      available
      isPast
    }
  }
`;

/** Lấy khung giờ còn trống của 1 ngày. branchId null → CEP tự dùng chi nhánh mặc định. */
export async function getArrivalAvailability(dateIso: string, branchId?: string): Promise<ArrivalSlot[]> {
  const data = await gql<{ calendarArrivalAvailability: ArrivalSlot[] }>(
    ARRIVAL_AVAILABILITY_QUERY,
    { date: dateIso, branchId: branchId ?? null },
  );
  return data.calendarArrivalAvailability ?? [];
}

export interface CalendarBranch {
  id: string;
  name: string;
  code?: string | null;
}

const BRANCHES_QUERY = `
  query CalendarBranches {
    calendarBranches { id name code }
  }
`;

/** Lấy danh sách chi nhánh từ CEP (telesale chọn / hiển thị động, không hardcode). */
export async function getCalendarBranches(): Promise<CalendarBranch[]> {
  const data = await gql<{ calendarBranches: CalendarBranch[] }>(BRANCHES_QUERY);
  return data.calendarBranches ?? [];
}
