import type { IncidentStreamObserver, Dispose } from "../../application/ports.ts";
import { normalizeIncident } from "../http/incidentMapper.ts";

export function subscribeToIncidents(observer: IncidentStreamObserver): Dispose {
  let active = true;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    source = new EventSource("/api/incidents/stream");
    source.onopen = () => { if (active) observer.opened(); };
    source.onmessage = (event) => {
      if (!active) return;
      try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data)) throw new Error("Expected incident array");
        observer.snapshot(data.map(normalizeIncident));
      } catch {
        observer.invalidMessage();
      }
    };
    source.onerror = () => {
      if (!active) return;
      observer.disconnected();
      source?.close();
      reconnectTimer = setTimeout(connect, 4000);
    };
  }

  connect();
  return () => {
    active = false;
    source?.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}
