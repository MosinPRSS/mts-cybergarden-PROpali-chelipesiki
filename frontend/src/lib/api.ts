import type { Incident } from "../types";
import { normalizeIncident } from "./incidents";
import { COORDINATOR_ACCESS_MESSAGE, notifySessionExpired } from "./auth";

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
