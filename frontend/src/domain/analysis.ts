import type { Incident } from "./incidents/types.ts";

export interface DashboardSummary {
  status: "ready" | "fallback" | "empty";
  summary: string;
  highlights: {
    incident: Incident;
    reason: "critical_urgent" | "critical" | "coordinator" | "high" | "research";
    summary: string;
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
