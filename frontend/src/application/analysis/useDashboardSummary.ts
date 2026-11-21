import { useEffect, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import type { DashboardSummary, SummaryMode } from "../../domain/analysis.ts";
import { summaryCandidates } from "../../domain/incidents/summary.ts";
import { useServices } from "../servicesContext.ts";

export function useDashboardSummary(incidents: Incident[], now: number, mode: SummaryMode = "upcoming") {
  const { analysis } = useServices();
  const [overview, setOverview] = useState<DashboardSummary | null>(null);
  const [loadedRevision, setLoadedRevision] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const candidates = summaryCandidates(incidents, mode, now);
  // Membership changes at 30 minutes and at the deadline, even without SSE.
  const revision = `${mode}:${candidates.map((item) => `${item.id}:${item.updated}:${item.deadline}:${item.priorityId}:${item.impactId}:${item.status}:${item.team}`).join("|")}`;

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
        const data = await analysis.dashboard(controller.signal, mode);
        if (data.mode !== mode) throw new Error("Unexpected summary mode");
        if (active) { setOverview(data); setLoadedRevision(revision); }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    const initial = setTimeout(load, 1000);
    const interval = setInterval(load, 60000);
    return () => { active = false; controller.abort(); clearTimeout(initial); clearInterval(interval); };
  }, [revision, refresh, analysis, mode]);

  const fresh = loadedRevision === revision && overview?.mode === mode;
  const explanations = new Map((fresh ? overview.highlights : []).map((item) => [item.incident.id, item]));
  // Always show every overdue entry, including during loading and provider outages.
  const highlights: DashboardSummary["highlights"] = (mode === "overdue" ? candidates : candidates.slice(0, 3))
    .map((incident) => {
      const result = explanations.get(incident.id);
      if (result && result.incident.updated === incident.updated) return { ...result, incident };
      return { incident, reason: mode === "overdue" ? "overdue" : incident.priorityId === 4 ? "critical_urgent" : "deadline_soon",
        analyzed: false, summary: mode === "overdue"
          ? "Подтвердите фактический статус у ответственного. Если инцидент актуален, уточните причину задержки и следующий шаг."
          : "Срок истекает в ближайшие 30 минут. Проверьте ход восстановления и ответственного." };
    });
  return { overview: fresh ? overview : null, loading, error, highlights, candidateCount: candidates.length,
    refresh: () => setRefresh((value) => value + 1) };
}
