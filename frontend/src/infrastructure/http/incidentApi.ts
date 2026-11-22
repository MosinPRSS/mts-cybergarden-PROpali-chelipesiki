import type { Incident } from "../../domain/incidents/types.ts";
import type { DashboardSummary, IncidentSummary, SummaryMode, SummaryWindow } from "../../domain/analysis.ts";
import type { TeamCandidate, TeamRecommendation } from "../../domain/teams/types.ts";
import { normalizeIncident } from "./incidentMapper.ts";
import { COORDINATOR_ACCESS_MESSAGE, notifySessionExpired } from "./authApi.ts";

function ensureAuthorized(response: Response) {
  if (response.status === 401) notifySessionExpired();
  if (response.status === 403) notifySessionExpired(COORDINATOR_ACCESS_MESSAGE);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function fetchIncidents(signal?: AbortSignal): Promise<Incident[]> {
  const timeout = AbortSignal.timeout(15000);
  const res = await fetch("/api/incidents", {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  ensureAuthorized(res);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected an incident array");
  return data.map(normalizeIncident);
}

export async function fetchDashboardSummary(signal?: AbortSignal, mode: SummaryMode = "upcoming", windowMinutes: SummaryWindow = 30): Promise<DashboardSummary> {
  const windowQuery = mode === "upcoming" ? `&window_minutes=${windowMinutes}` : "";
  const res = await fetch(`/api/incidents/summary?mode=${mode}${windowQuery}`, { signal, cache: "no-store" });
  ensureAuthorized(res);
  const data: DashboardSummary = await res.json();
  return {
    ...data,
    highlights: data.highlights.map((item) => ({ ...item, incident: normalizeIncident(item.incident) })),
  };
}

export async function fetchIncidentSummary(id: string, signal?: AbortSignal): Promise<IncidentSummary> {
  const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/summary`, { signal });
  if (res.status === 409) throw new Error("Данные изменились. Повторите анализ.");
  if (res.status === 503) throw new Error("ИИ-анализ временно недоступен. Попробуйте позже.");
  ensureAuthorized(res);
  return res.json();
}

export async function fetchTeamRecommendation(id: string, teams: TeamCandidate[], signal?: AbortSignal): Promise<TeamRecommendation> {
  let res: Response;
  try {
    res = await fetch(`/api/incidents/${encodeURIComponent(id)}/recommend-team`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams }), signal, cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Нет связи. Повторите подбор.");
  }
  if (res.status === 409) throw new Error("Данные изменились. Повторите подбор.");
  if (res.status === 503) throw new Error("ИИ-подбор недоступен. Попробуйте ещё раз.");
  ensureAuthorized(res);
  return res.json();
}

export async function resolveIncident(id: string): Promise<Incident> {
  const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
  });
  ensureAuthorized(res);
  const data = await res.json();
  return normalizeIncident(data);
}

export async function assignIncident(
  id: string,
  team: string,
  assignee?: string,
  selectedWithAi = false,
): Promise<Incident> {
  const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ team, assignee, team_selected_with_ai: selectedWithAi }),
  });
  ensureAuthorized(res);
  const data = await res.json();
  return normalizeIncident(data);
}

export async function fetchIncidentsForTeam(team: TeamCandidate, signal?: AbortSignal): Promise<TeamRecommendation[]> {
  const res = await fetch("/api/incidents/recommend-for-team", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(team), signal, cache: "no-store",
  });
  if (res.status === 409) throw new Error("Данные изменились. Повторите подбор.");
  if (res.status === 503) throw new Error("ИИ-подбор недоступен. Попробуйте ещё раз.");
  ensureAuthorized(res);
  return res.json();
}

export async function undoResolveIncident(id: string, updated: string): Promise<Incident> {
  const response = await fetch(`/api/incidents/${encodeURIComponent(id)}/undo-resolve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updated_at: updated }),
  });
  ensureAuthorized(response);
  return normalizeIncident(await response.json());
}

export async function closeIncident(id: string, updated: string): Promise<Incident> {
  const response = await fetch(`/api/incidents/${encodeURIComponent(id)}/close`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updated_at: updated }),
  });
  ensureAuthorized(response);
  return normalizeIncident(await response.json());
}
