import type { Incident } from "./types.ts";

export const SIGNIFICANCE_ORDER = [
  "Критические",
  "На координаторах",
  "Высокий приоритет",
  "Исследование ситуации",
];

export function getIncidentGroups(incident: Incident): string[] {
  if (Array.isArray(incident.groups)) {
    return incident.groups;
  }
  const derived: string[] = [];
  const active = isIncidentActive(incident);
  if (active && (incident.priorityId === 4 || incident.priority === "Critical")) derived.push("Критические");
  if ((active || incident.status === "Research") && incident.team === "КЦ ИТ Координаторы Массовых Инцидентов") {
    derived.push("На координаторах");
  }
  if (active && (incident.priorityId === 3 || incident.priority === "High")) derived.push("Высокий приоритет");
  if (incident.status === "Research") {
    derived.push("Исследование ситуации");
  }
  return derived;
}

export function isIncidentResolved(incident: Incident): boolean {
  return incident.is_resolved ?? ["Resolved", "Closed", "Research"].includes(incident.status || "");
}

export function isResolvedOlderThanDay(incident: Incident, now: number = Date.now()): boolean {
  // Research can still require routing today, regardless of the recovery date.
  if (incident.status === "Research" || getIncidentGroups(incident).includes("Исследование ситуации")) return false;
  if (!isIncidentResolved(incident)) {
    return false;
  }
  const dateStr =
    incident.completionDate ||
    (incident as unknown as Record<string, unknown>).completion_date ||
    incident.updated ||
    (incident as unknown as Record<string, unknown>).updated_at;
  if (!dateStr || typeof dateStr !== "string") return false;
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return false;
  return now - time >= 24 * 60 * 60 * 1000;
}

export function isIncidentActive(incident: Incident): boolean {
  return incident.is_active ?? !isIncidentResolved(incident);
}

export function getPrimaryGroup(incident: Incident): string {
  const groups = getIncidentGroups(incident);
  for (const sig of SIGNIFICANCE_ORDER) {
    if (groups.includes(sig)) return sig;
  }
  return groups[0] || "Прочие";
}

export function getIncidentBoardGroups(incident: Incident): string[] {
  const groups = getIncidentGroups(incident);
  return groups.length ? [getPrimaryGroup(incident)] : [];
}

