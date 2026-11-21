import { useCallback, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import { useServices } from "../servicesContext.ts";

export type IncidentActionFailure = { action: "resolve" | "assign"; id: string };

export function useIncidentActions(
  applySaved: (incident: Incident) => void,
  onFailure: (failure: IncidentActionFailure) => void,
  onAssigned: (incident: Incident) => void,
) {
  const { incidents: gateway } = useServices();
  const pending = useRef(new Set<string>());
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const resolve = useCallback(async (incident: Incident) => {
    if (pending.current.has(incident.id)) return;
    pending.current.add(incident.id);
    setSavingIds([...pending.current]);
    try { applySaved(await gateway.resolve(incident.id)); }
    catch { onFailure({ action: "resolve", id: incident.id }); }
    finally { pending.current.delete(incident.id); setSavingIds([...pending.current]); }
  }, [gateway, applySaved, onFailure]);

  const assign = useCallback(async (id: string, team: string, assignee?: string) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setSavingIds([...pending.current]);
    try {
      const saved = await gateway.assign(id, team, assignee);
      applySaved(saved);
      onAssigned(saved);
    } catch { onFailure({ action: "assign", id }); }
    finally { pending.current.delete(id); setSavingIds([...pending.current]); }
  }, [gateway, applySaved, onFailure, onAssigned]);

  return { resolve, assign, savingIds };
}
