import type { Incident } from "../types";
import { normalizeIncident } from "./incidents";

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected an incident array");
  return data.map(normalizeIncident);
}

export async function resolveIncident(id: string): Promise<Incident> {
  const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return normalizeIncident(data);
}
