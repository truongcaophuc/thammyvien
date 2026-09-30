// Save kết quả cuộc gọi cho 1 lead — wrap GraphQL mutation saveCallResult.
import { gql } from "./graphql";
import type { ResultKey } from "../data";

export interface SaveCallResultInput {
  leadId: string;
  result: ResultKey;
  notes?: string;
  // ISO 8601 datetime. Chỉ truyền khi result=BOOKED.
  appointmentDate?: string;
  // Chi nhánh đặt lịch (BOOKED). Null → CEP dùng chi nhánh mặc định.
  locationId?: string;
  recordingBase64?: string;
  recordingFileName?: string;
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

const UPDATE_CALL_RECORDING_MUTATION = `
  mutation UpdateCallRecording($callId: UUID!, $recordingBase64: String!, $recordingFileName: String!) {
    updateCallRecording(callId: $callId, recordingBase64: $recordingBase64, recordingFileName: $recordingFileName)
  }
`;

export async function updateCallRecording(input: {
  callId: string;
  recordingBase64: string;
  recordingFileName: string;
}): Promise<boolean> {
  const data = await gql<{ updateCallRecording: boolean }>(
    UPDATE_CALL_RECORDING_MUTATION,
    input,
  );
  return data.updateCallRecording;
}

const UPDATE_CALL_NOTE_MUTATION = `
  mutation UpdateCallNote($callId: UUID!, $notes: String!) {
    updateCallNote(callId: $callId, notes: $notes)
  }
`;

export async function updateCallNote(input: {
  callId: string;
  notes: string;
}): Promise<boolean> {
  const data = await gql<{ updateCallNote: boolean }>(
    UPDATE_CALL_NOTE_MUTATION,
    input,
  );
  return data.updateCallNote;
}
