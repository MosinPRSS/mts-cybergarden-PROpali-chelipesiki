import { useCallback, useEffect, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import { useServices } from "../servicesContext.ts";

export type ConnectionStatus = "connected" | "disconnected" | "load-error" | "invalid-message";
export type SnapshotListener = (previous: Map<string, Incident> | null, current: Incident[]) => void;

export function useIncidents(onSnapshot: SnapshotListener, onConnection: (status: ConnectionStatus) => void) {
  const { incidents: gateway, lifecycle } = useServices();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const previous = useRef<Map<string, Incident> | null>(null);
  const revision = useRef(0);

  const applySnapshot = useCallback((data: Incident[]) => {
    revision.current += 1;
    onSnapshot(previous.current, data);
    previous.current = new Map(data.map((item) => [item.id, item]));
    setIncidents(data);
  }, [onSnapshot]);

  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    async function refresh() {
      const startedAt = revision.current;
      const request = ++requestNumber;
      try {
        const data = await gateway.list();
        // HTTP responses started before an SSE update or a saved action are stale.
        if (active && startedAt === revision.current && request === requestNumber) applySnapshot(data);
      } catch {
        if (active) onConnection("load-error");
      }
    }
    void refresh();
    const disconnect = gateway.subscribe({
      opened() { if (active) { onConnection("connected"); void refresh(); } },
      snapshot(data) { if (active) applySnapshot(data); },
      disconnected() { if (active) onConnection("disconnected"); },
      invalidMessage() { if (active) { onConnection("invalid-message"); void refresh(); } },
    });
    const stopWatching = lifecycle.onVisible(() => { void refresh(); });
    return () => { active = false; disconnect(); stopWatching(); };
  }, [gateway, lifecycle, applySnapshot, onConnection]);

  const applySavedIncident = useCallback((saved: Incident) => {
    const map = previous.current;
    if (!map) return;
    const current = map.get(saved.id);
    if (current && Date.parse(current.updated) > Date.parse(saved.updated)) return;
    applySnapshot(Array.from(map.values(), (item) => item.id === saved.id ? saved : item));
  }, [applySnapshot]);

  return { incidents, applySavedIncident };
}
