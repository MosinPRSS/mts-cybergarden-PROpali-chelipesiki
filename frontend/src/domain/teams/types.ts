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

export interface TeamCandidate {
  id: string;
  name: string;
  domain: string;
  description: string;
  services: string[];
  skills: string[];
}

export interface TeamRecommendation {
  incident_id: string;
  team: { id: string; name: string } | null;
  match_percent: number;
  reason: string;
  criteria: { product_service: number; technical_skills: number; responsibility: number };
  generated_at: string;
  incident_updated_at: string;
}
