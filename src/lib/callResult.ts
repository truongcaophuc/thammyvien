// Save kết quả cuộc gọi cho 1 lead — wrap GraphQL mutation saveCallResult.
import { gql } from "./graphql";
import type { ResultKey } from "../data";

export interface SaveCallResultInput {
  leadId: string;
  result: ResultKey;
  notes?: string;
  // ISO 8601 datetime. Chỉ truyền khi result=BOOKED.
  appointmentDate?: string;
}

export interface SaveCallResultPayload {
  callId: string;
  appointmentId: string | null;
  success: boolean;
}

const SAVE_CALL_RESULT_MUTATION = `
  mutation SaveCallResult($input: SaveCallResultInput!) {
    saveCallResult(input: $input) {
      callId
      appointmentId
      success
    }
  }
`;

export async function saveCallResult(
  input: SaveCallResultInput,
): Promise<SaveCallResultPayload> {
  const data = await gql<{ saveCallResult: SaveCallResultPayload }>(
    SAVE_CALL_RESULT_MUTATION,
    { input },
  );
  return data.saveCallResult;
}
