export type IconName =
  | "menu"
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

export interface Column {
  key: string;
  id: string;
  title: string;
  hint: string;
  badgeClass: string;
  priorityRank: number;
  isCustom?: boolean;
}

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
