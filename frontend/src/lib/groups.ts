import type { Incident } from "../types";
import { SIGNIFICANCE_ORDER } from "../data/constants.ts";

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

export function getGroupBadgeClass(groupName: string): string {
  switch (groupName) {
    case "Критические":
      return "critical";
    case "На координаторах":
      return "assigned";
    case "Высокий приоритет":
      return "high";
    case "Исследование ситуации":
      return "resolved";
    default:
      return "custom";
  }
}
