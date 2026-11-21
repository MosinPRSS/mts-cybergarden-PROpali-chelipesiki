import type { Incident } from "./types.ts";
import type { SummaryMode, SummaryWindow } from "../analysis.ts";

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
