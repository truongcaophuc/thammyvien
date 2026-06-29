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
  query ArrivalAvailability($date: String!) {
    calendarArrivalAvailability(date: $date) {
      startAt
      booked
      capacity
      available
      isPast
    }
  }
`;

/** Lấy khung giờ còn trống của 1 ngày (mặc định chi nhánh + loại arrival-slot duy nhất). */
export async function getArrivalAvailability(dateIso: string): Promise<ArrivalSlot[]> {
  const data = await gql<{ calendarArrivalAvailability: ArrivalSlot[] }>(
    ARRIVAL_AVAILABILITY_QUERY,
    { date: dateIso },
  );
  return data.calendarArrivalAvailability ?? [];
}
