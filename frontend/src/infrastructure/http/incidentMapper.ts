import type { Incident } from "../../domain/incidents/types.ts";

// ITSM service is a component description; the card title must be productName.
export function normalizeIncident(incident: Incident): Incident {
  if (typeof incident.productName !== "string") return incident;
  return {
    ...incident,
    sourceService: incident.sourceService ?? incident.service,
    service: incident.productName,
  };
}
