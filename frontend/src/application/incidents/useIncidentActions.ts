import { useCallback, useEffect, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import { useServices } from "../servicesContext.ts";

export type IncidentActionFailure = { action: "resolve" | "assign" | "undo" | "close"; id: string };

export function useIncidentActions(
  applySaved: (incident: Incident) => void,
  onFailure: (failure: IncidentActionFailure) => void,
  onAssigned: (incident: Incident) => void,
) {
  const { incidents: gateway } = useServices();
  const pending = useRef(new Set<string>());
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const [undoable, setUndoable] = useState<Incident[]>([]);
  useEffect(() => {
    if (!undoable.length) return;
    const nextExpiry = Math.min(...undoable.map((item) => Date.parse(item.undo_resolve_until!)));
    const timer = setTimeout(() => setUndoable((items) => items.filter(
      (item) => Date.parse(item.undo_resolve_until!) > Date.now())), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [undoable]);

  const undoResolve = useCallback(async (incident: Incident) => {
    if (pending.current.has(incident.id)) return;
    pending.current.add(incident.id); setSavingIds([...pending.current]);
    try { applySaved(await gateway.undoResolve(incident.id, incident.updated)); }
    catch { onFailure({ action: "undo", id: incident.id }); }
    finally {
      setUndoable((items) => items.filter((item) => item.id !== incident.id));
      pending.current.delete(incident.id); setSavingIds([...pending.current]);
    }
  }, [gateway, applySaved, onFailure]);

  const resolve = useCallback(async (incident: Incident) => {
    if (pending.current.has(incident.id)) return;
    pending.current.add(incident.id);
    setSavingIds([...pending.current]);
    try {
      const saved = await gateway.resolve(incident.id);
      applySaved(saved);
      if (Date.parse(saved.undo_resolve_until || "") > Date.now()) {
        setUndoable((items) => [...items.filter((item) => item.id !== saved.id), saved]);
      }
    }
    catch { onFailure({ action: "resolve", id: incident.id }); }
    finally { pending.current.delete(incident.id); setSavingIds([...pending.current]); }
  }, [gateway, applySaved, onFailure]);

  const close = useCallback(async (incident: Incident) => {
    if (pending.current.has(incident.id)) return;
    pending.current.add(incident.id); setSavingIds([...pending.current]);
    try {
      applySaved(await gateway.close(incident.id, incident.updated));
      setUndoable((items) => items.filter((item) => item.id !== incident.id));
    } catch { onFailure({ action: "close", id: incident.id }); }
    finally { pending.current.delete(incident.id); setSavingIds([...pending.current]); }
  }, [gateway, applySaved, onFailure]);

  const assign = useCallback(async (id: string, team: string, assignee?: string, selectedWithAi = false) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setSavingIds([...pending.current]);
    try {
      const saved = await gateway.assign(id, team, assignee, selectedWithAi);
      applySaved(saved);
      onAssigned(saved);
    } catch { onFailure({ action: "assign", id }); }
    finally { pending.current.delete(id); setSavingIds([...pending.current]); }
  }, [gateway, applySaved, onFailure, onAssigned]);

  return { resolve, assign, savingIds, undoable, undoResolve, close };
}
