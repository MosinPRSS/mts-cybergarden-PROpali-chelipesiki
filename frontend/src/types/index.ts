export type IconName =
  | "grid"
  | "chart"
  | "users"
  | "history"
  | "settings"
  | "search"
  | "bell"
  | "sun"
  | "moon"
  | "chevron"
  | "close"
  | "check"
  | "external"
  | "spark"
  | "clock"
  | "user"
  | "activity"
  | "filter"
  | "more"
  | "refresh"
  | "tag"
  | "trash"
  | "smart_toy"
  | "toy_robot";

export type NotificationType = "critical" | "assigned" | "resolved" | "info";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  incidentId?: string;
  service?: string;
}

export interface Incident {
  id: string;
  priority: string;
  service: string;
  area: string;
  summary: string;
  team: string;
  assignee?: string;
  sla: number | null;
  productName?: string;
  sourceService?: string;
  priorityId?: number;
  state?: string;
  status?: string;
  is_active?: boolean;
  is_resolved?: boolean;
  deadline?: string | null;
  completionDate?: string | null;
  lastAssignmentToTeamDateTime?: string | null;
  description?: string;
  solution?: string;
  sla_state?: "remaining" | "overdue" | "met" | "breached" | "no_deadline" | "unknown";
  affected: string;
  ai: string;
  updated: string;
  created?: string;
  groups?: string[];
  tags?: string[];
}

export interface Column {
  key: string;
  id: string;
  title: string;
  hint: string;
  badgeClass: string;
  priorityRank: number;
  isCustom?: boolean;
}

export type DistributionMode = "significant" | "multi";

export interface AlertBannerState {
  type: "critical" | "assigned" | "resolved";
  text: string;
}

export interface LiveStatusState {
  text: string;
  ok: boolean;
}

export interface NavItemConfig {
  key: string;
  icon: IconName;
  label: string;
  badge?: string;
}

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
