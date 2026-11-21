import type { Incident } from "../../domain/incidents/types.ts";
import type { DashboardSummary, IncidentSummary, SummaryMode } from "../../domain/analysis.ts";
import { normalizeIncident } from "./incidentMapper.ts";
import { COORDINATOR_ACCESS_MESSAGE, notifySessionExpired } from "./authApi.ts";

function ensureAuthorized(response: Response) {
  if (response.status === 401) notifySessionExpired();
  if (response.status === 403) notifySessionExpired(COORDINATOR_ACCESS_MESSAGE);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  ensureAuthorized(res);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected an incident array");
  return data.map(normalizeIncident);
}

export async function fetchDashboardSummary(signal?: AbortSignal, mode: SummaryMode = "upcoming"): Promise<DashboardSummary> {
  const res = await fetch(`/api/incidents/summary?mode=${mode}`, { signal, cache: "no-store" });
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
  assignee?: string
): Promise<Incident> {
  const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ team, assignee }),
  });
  ensureAuthorized(res);
  const data = await res.json();
  return normalizeIncident(data);
}
