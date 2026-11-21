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
    let connected: boolean | null = null;
    let requestNumber = 0;
    let controller: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    function clearRetry() {
      if (retry !== null) clearTimeout(retry);
      retry = null;
    }
    async function refresh() {
      clearRetry();
      controller?.abort();
      controller = new AbortController();
      const startedAt = revision.current;
      const request = ++requestNumber;
      try {
        const data = await gateway.list(controller.signal);
        // HTTP responses started before an SSE update or a saved action are stale.
        if (active && startedAt === revision.current && request === requestNumber) {
          retryDelay = 1000;
          applySnapshot(data);
          if (connected !== null) onConnection(connected ? "connected" : "disconnected");
        }
      } catch {
        if (!active || request !== requestNumber || startedAt !== revision.current) return;
        onConnection("load-error");
        retry = setTimeout(() => { void refresh(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    }
    void refresh();
    const disconnect = gateway.subscribe({
      opened() { if (active) { connected = true; onConnection("connected"); void refresh(); } },
      snapshot(data) {
        if (!active) return;
        clearRetry();
        connected = true;
        retryDelay = 1000;
        applySnapshot(data);
        onConnection("connected");
      },
      disconnected() { if (active) { connected = false; onConnection("disconnected"); } },
      invalidMessage() { if (active) { onConnection("invalid-message"); void refresh(); } },
    });
    const stopWatching = lifecycle.onVisible(() => { void refresh(); });
    return () => { active = false; clearRetry(); controller?.abort(); disconnect(); stopWatching(); };
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
