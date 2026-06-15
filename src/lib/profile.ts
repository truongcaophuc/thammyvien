// Profile (tab Cá nhân) — fetch agent info + thành tích tháng + today summary.
import { gql } from "./graphql";

export interface Profile {
  agentName: string;
  agentRole: string;
  userName: string;
  monthlyCallCount: number;
  monthlyAppointmentCount: number;
  monthlyConnectRatePct: number;
  todayCalledCount: number;
  todayToCallCount: number;
}

const PROFILE_QUERY = `
  query MyProfile {
    myProfile {
      agentName
      agentRole
      userName
      monthlyCallCount
      monthlyAppointmentCount
      monthlyConnectRatePct
      todayCalledCount
      todayToCallCount
    }
  }
`;

export async function fetchProfile(): Promise<Profile> {
  const data = await gql<{ myProfile: Profile }>(PROFILE_QUERY);
  return data.myProfile;
}
