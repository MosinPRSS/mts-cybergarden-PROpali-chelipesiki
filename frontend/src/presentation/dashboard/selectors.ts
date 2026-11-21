import type { Incident, IncidentView } from "../../domain/incidents/types.ts";
import { getIncidentGroups, getPrimaryGroup, isIncidentActive } from "../../domain/incidents/groups.ts";
import { matchesIncidentView } from "../../domain/incidents/selectors.ts";
import { formatSla } from "../formatters.ts";

export function filterBoardIncidents(incidents: Incident[], query: string, view: IncidentView): Incident[] {
  return incidents.filter((incident) => {
    const matches = `${incident.id} ${incident.service} ${incident.area} ${incident.summary} ${getIncidentGroups(incident).join(" ")}`
      .toLowerCase().includes(query.toLowerCase());
    return matches && matchesIncidentView(incident, view);
  });
}

export function getDashboardMetrics(incidents: Incident[], slaFor: (item: Incident) => number | null) {
  const active = incidents.filter(isIncidentActive);
  const activeWithSla = active.map(slaFor).filter((value): value is number => value !== null).sort((a, b) => a - b);
  return {
    criticalCount: incidents.filter((item) => getIncidentGroups(item).includes("Критические")).length,
    riskCount: active.filter((item) => slaFor(item) !== null && slaFor(item)! < 15 * 60).length,
    nearestRiskSla: activeWithSla.length ? formatSla(activeWithSla[0]) : "—",
    workloadCount: active.length,
    resolvedMetCount: incidents.filter((item) => item.sla_state === "met").length,
    resolvedWithDeadlineCount: incidents.filter((item) => item.sla_state === "met" || item.sla_state === "breached").length,
    totalCount: incidents.filter((item) => matchesIncidentView(item, "all") && getIncidentGroups(item).length > 0 && getPrimaryGroup(item) !== "Исследование ситуации").length,
    researchCount: incidents.filter((item) => matchesIncidentView(item, "research")).length,
    myTeamCount: incidents.filter((item) => matchesIncidentView(item, "team")).length,
  };
}

export function filterIncidentHistory(incidents: Incident[], query: string): Incident[] {
  return incidents.filter((item) => ["Resolved", "Closed"].includes(item.status || "") &&
    `${item.id} ${item.service} ${item.summary}`.toLowerCase().includes(query.toLowerCase()));
}
