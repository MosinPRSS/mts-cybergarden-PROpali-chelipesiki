import type { Incident } from "./types.ts";
import type { SummaryMode } from "../analysis.ts";

export const UPCOMING_WINDOW_MS = 30 * 60 * 1000;

// Keep live previews and SQL selection aligned, including exact deadline boundaries.
export function summaryCandidates(incidents: Incident[], mode: SummaryMode, now: number): Incident[] {
  return incidents.filter((item) => {
    if (!["Assigned", "WorkInProgress"].includes(item.status || "") || !item.deadline) return false;
    const deadline = Date.parse(item.deadline);
    if (!Number.isFinite(deadline)) return false;
    return mode === "overdue" ? deadline <= now : now < deadline && deadline <= now + UPCOMING_WINDOW_MS;
  }).sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!)
    || (b.priorityId ?? 0) - (a.priorityId ?? 0)
    || (b.impactId ?? 0) - (a.impactId ?? 0)
    || Date.parse(a.created_at || a.created || "") - Date.parse(b.created_at || b.created || "")
    || a.id.localeCompare(b.id));
}
