import type { Incident } from "../types";

// ITSM service is a component description; the card title must be productName.
export function normalizeIncident(incident: Incident): Incident {
  if (typeof incident.productName !== "string") return incident;
  return {
    ...incident,
    sourceService: incident.sourceService ?? incident.service,
    service: incident.productName,
  };
}
