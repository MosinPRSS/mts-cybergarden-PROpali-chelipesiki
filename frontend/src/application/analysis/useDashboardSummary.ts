import { useEffect, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import type { DashboardSummary } from "../../domain/analysis.ts";
import { useServices } from "../servicesContext.ts";

export function useDashboardSummary(incidents: Incident[]) {
  const { analysis } = useServices();
  const [overview, setOverview] = useState<DashboardSummary | null>(null);
  const [loadedRevision, setLoadedRevision] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // SSE refreshes include unchanged rows: only actual revisions trigger a request.
  const revision = incidents.map((item) => `${item.id}:${item.updated}:${item.status}:${item.team}`).sort().join("|");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      setLoading(true);
      setError(false);
      try {
        const data = await analysis.dashboard(controller.signal);
        if (active) { setOverview(data); setLoadedRevision(revision); }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    // Briefly coalesce a new incident snapshot and the initial mount.
    const initial = setTimeout(load, 1000);
    const interval = setInterval(load, 60000);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [revision, refresh, analysis]);

  const fresh = loadedRevision === revision;
  const current = new Map(incidents.map((item) => [item.id, item]));
  const highlights = (fresh ? overview : null)?.highlights.filter(({ incident }) => {
    const live = current.get(incident.id);
    return live && live.updated === incident.updated && (live.is_active || live.status === "Research");
  }) ?? [];

  return { overview, loading, error, fresh, highlights, current, refresh: () => setRefresh((value) => value + 1) };
}
