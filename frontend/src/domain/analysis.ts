import type { Incident } from "./incidents/types.ts";

export type SummaryMode = "upcoming" | "overdue";
export type SummaryWindow = 30 | 60 | 120 | 360 | 720 | 1440;

export interface DashboardSummary {
  status: "ready" | "partial" | "fallback" | "empty";
  mode: SummaryMode;
  window_minutes: SummaryWindow;
  summary: string;
  highlights: {
    incident: Incident;
    reason: "critical_urgent" | "deadline_soon" | "overdue";
    summary: string;
    analyzed: boolean;
  }[];
  limitations: string[];
  total_candidates: number;
  analyzed_count: number;
  as_of: string;
  generated_at: string | null;
  statistics: Record<string, number>;
}

export interface IncidentSummary {
  incident_id: string;
  summary: string;
  related_incidents_used: { incident_id: string; contribution: string }[];
  limitations: string[];
  generated_at: string;
  incident_updated_at: string;
}
