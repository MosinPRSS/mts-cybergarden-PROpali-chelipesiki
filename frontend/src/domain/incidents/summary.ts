import type { Incident } from "./types.ts";
import type { SummaryMode, SummaryWindow } from "../analysis.ts";

export type OverduePriority = "all" | "1" | "2" | "3" | "4";
export type OverdueAge = "all" | "under_hour" | "one_to_six" | "six_to_day" | "day_or_more";

export function matchesOverdueFilters(incident: Incident, now: number, priority: OverduePriority, age: OverdueAge): boolean {
  if (priority !== "all" && String(incident.priorityId) !== priority) return false;
  const minutes = (now - Date.parse(incident.deadline || "")) / 60000;
  if (!Number.isFinite(minutes) || minutes < 0) return false;
  switch (age) {
    case "under_hour": return minutes < 60;
    case "one_to_six": return minutes >= 60 && minutes < 360;
    case "six_to_day": return minutes >= 360 && minutes < 1440;
    case "day_or_more": return minutes >= 1440;
    default: return true;
  }
}

// Keep live previews and SQL selection aligned, including exact deadline boundaries.
export function summaryCandidates(incidents: Incident[], mode: SummaryMode, now: number, windowMinutes: SummaryWindow = 30): Incident[] {
  return incidents.filter((item) => {
    if (!["Assigned", "WorkInProgress"].includes(item.status || "") || !item.deadline) return false;
    const deadline = Date.parse(item.deadline);
    if (!Number.isFinite(deadline)) return false;
    return mode === "overdue" ? deadline <= now : now < deadline && deadline <= now + windowMinutes * 60000;
  }).sort((a, b) => (b.impactId ?? 0) - (a.impactId ?? 0)
    || Date.parse(a.deadline!) - Date.parse(b.deadline!)
    || (b.priorityId ?? 0) - (a.priorityId ?? 0)
    || Date.parse(a.created_at || a.created || "") - Date.parse(b.created_at || b.created || "")
    || a.id.localeCompare(b.id));
}
