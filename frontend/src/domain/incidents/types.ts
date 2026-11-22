export interface Incident {
  id: string;
  resolved_by?: string | null;
  closed_by?: string | null;
  closed_at?: string | null;
  undo_resolve_until?: string | null;
  priority: string;
  service: string;
  area: string;
  summary: string;
  team: string;
  team_selected_with_ai?: boolean;
  assignee?: string;
  sla: number | null;
  productName?: string;
  sourceService?: string;
  priorityId?: number;
  impactId?: number;
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
  itsm_url?: string | null;
  updated: string;
  created?: string;
  created_at?: string;
  groups?: string[];
  tags?: string[];
}

export type IncidentView = "all" | "research" | "team";
