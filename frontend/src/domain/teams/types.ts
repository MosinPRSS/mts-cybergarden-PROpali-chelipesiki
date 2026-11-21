export interface TeamMember {
  name: string;
  login: string;
  role: string;
  phone?: string;
  telegram?: string;
}

export type TeamDutyStatus = "on_duty" | "busy" | "standby";

export interface Team {
  id: string;
  name: string;
  domain: string;
  description: string;
  lead: TeamMember;
  membersCount: number;
  services: string[];
  tags: string[];
  status: TeamDutyStatus;
  shiftSchedule: string;
  channel: string;
}
