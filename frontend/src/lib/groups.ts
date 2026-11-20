import { Incident } from "../types";
import { SIGNIFICANCE_ORDER } from "../data/constants";

export function getIncidentGroups(incident: Incident): string[] {
  if (Array.isArray(incident.groups) && incident.groups.length > 0) {
    return incident.groups;
  }
  const derived: string[] = [];
  if (incident.priority === "Critical") derived.push("Критические");
  if (incident.team?.includes("Координатор") || incident.priority === "Assigned") {
    derived.push("На координаторах");
  }
  if (incident.priority === "High") derived.push("Высокий риск");
  if (incident.priority === "Resolved" || incident.priority === "Решено") {
    derived.push("Исследование ситуации");
  }
  return derived.length > 0 ? derived : ["Критические"];
}

export function getPrimaryGroup(incident: Incident): string {
  const groups = getIncidentGroups(incident);
  for (const sig of SIGNIFICANCE_ORDER) {
    if (groups.includes(sig)) return sig;
  }
  return groups[0] || "Критические";
}

export function getGroupBadgeClass(groupName: string): string {
  switch (groupName) {
    case "Критические":
      return "critical";
    case "На координаторах":
      return "assigned";
    case "Высокий риск":
      return "high";
    case "Исследование ситуации":
      return "resolved";
    default:
      return "custom";
  }
}
