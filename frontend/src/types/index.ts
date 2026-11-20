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
  | "external"
  | "spark"
  | "clock"
  | "user"
  | "activity"
  | "filter"
  | "more"
  | "refresh"
  | "tag";

export interface Incident {
  id: string;
  priority: string;
  service: string;
  area: string;
  summary: string;
  team: string;
  assignee?: string;
  sla: number;
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
