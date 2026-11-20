import { Incident } from "../types";

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function addIncidentGroup(incidentId: string, groupName: string): Promise<Incident> {
  const res = await fetch(`/api/incidents/${incidentId}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group: groupName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function removeIncidentGroup(incidentId: string, groupName: string): Promise<Incident> {
  const res = await fetch(`/api/incidents/${incidentId}/groups/${encodeURIComponent(groupName)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
