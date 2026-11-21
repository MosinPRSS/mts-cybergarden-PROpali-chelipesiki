import type { Incident } from "./types.ts";

export function remainingSla(incident: Incident, secondsPassed = 0, now = Date.now()): number | null {
  if (incident.is_resolved || ["Resolved", "Closed", "Research"].includes(incident.status || "")) return incident.sla;
  if (incident.deadline) return Math.ceil((Date.parse(incident.deadline) - now) / 1000);
  return incident.sla === null ? null : incident.sla - secondsPassed;
}
