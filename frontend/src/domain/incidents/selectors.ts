import type { Incident, IncidentView } from "./types.ts";
import { getIncidentGroups, isIncidentActive, isIncidentResolved } from "./groups.ts";

export function isIncidentOverdue(incident: Incident, seconds: number | null): boolean {
  return isIncidentActive(incident) && seconds !== null && Number.isFinite(seconds) && seconds <= 0;
}

export function isIncidentResearch(incident: Incident): boolean {
  return ["Research", "Resolved"].includes(incident.status || "") || getIncidentGroups(incident).includes("Исследование ситуации");
}

export function matchesIncidentView(incident: Incident, view: IncidentView): boolean {
  if (view === "research") return isIncidentResearch(incident);
  if (!isIncidentActive(incident) && !isIncidentResearch(incident)) return false;
  return view === "all" || getIncidentGroups(incident).includes("На координаторах");
}

function priorityRank(incident: Incident): number {
  if (incident.priorityId !== undefined) return incident.priorityId;
  switch (incident.priority.toLowerCase()) {
    case "critical": case "наивысший": return 4;
    case "high": case "высокий": return 3;
    case "medium": case "средний": return 2;
    default: return 1;
  }
}

function urgencyRank(seconds: number | null): number {
  if (seconds !== null && Number.isFinite(seconds)) {
    if (seconds <= 0) return 0;
    if (seconds < 15 * 60) return 1;
  }
  return 2;
}

function createdTime(incident: Incident): number {
  const time = Date.parse(incident.created_at || incident.created || "");
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

// Keep the server array intact; apply the same order in every column and archive.
export function sortIncidentsByUrgency(
  incidents: Incident[],
  slaFor: (incident: Incident) => number | null,
): Incident[] {
  return incidents.map((incident) => ({ incident, seconds: slaFor(incident) }))
    .sort((a, b) => {
      const resolvedA = isIncidentResolved(a.incident);
      const resolvedB = isIncidentResolved(b.incident);
      const resolvedOrder = Number(resolvedA) - Number(resolvedB);
      if (resolvedOrder) return resolvedOrder;
      if (!resolvedA) {
        const urgencyOrder = urgencyRank(a.seconds) - urgencyRank(b.seconds);
        if (urgencyOrder) return urgencyOrder;
        const priorityOrder = priorityRank(b.incident) - priorityRank(a.incident);
        if (priorityOrder) return priorityOrder;
      }
      const ageOrder = createdTime(a.incident) - createdTime(b.incident);
      if (ageOrder) return ageOrder;
      const deadlineOrder = (Number.isFinite(a.seconds) ? a.seconds! : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(b.seconds) ? b.seconds! : Number.MAX_SAFE_INTEGER);
      return deadlineOrder || a.incident.id.localeCompare(b.incident.id);
    }).map(({ incident }) => incident);
}

