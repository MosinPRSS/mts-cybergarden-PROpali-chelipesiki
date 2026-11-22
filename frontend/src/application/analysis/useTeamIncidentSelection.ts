import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import { getIncidentGroups, isIncidentActive } from "../../domain/incidents/groups.ts";
import type { Team, TeamRecommendation } from "../../domain/teams/types.ts";
import { useServices } from "../servicesContext.ts";

function appendArrivals(order: string[], incidents: Incident[]): string[] {
  const available = new Set(incidents.map((item) => item.id));
  const kept = order.filter((id) => available.has(id));
  const seen = new Set(kept);
  for (const item of incidents) {
    if (!seen.has(item.id)) { kept.push(item.id); seen.add(item.id); }
  }
  return kept;
}

export function useTeamIncidentSelection(team: Team, incidents: Incident[]) {
  const { analysis } = useServices();
  const eligible = useMemo(() => incidents.filter((item) => isIncidentActive(item) || item.status === "Research"), [incidents]);
  const [queue, setQueue] = useState(() => ({ source: incidents, ids: eligible.map((item) => item.id) }));
  const [snapshotIds, setSnapshotIds] = useState(() => new Set(queue.ids));
  const [results, setResults] = useState<TeamRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  // Existing cards retain their position even if the next SSE snapshot is reversed.
  if (queue.source !== incidents) {
    setQueue({ source: incidents, ids: appendArrivals(queue.ids, eligible) });
  }
  const orderedIds = useMemo(() => appendArrivals(queue.ids, eligible), [queue.ids, eligible]);
  const orderedIncidents = useMemo(() => {
    const byId = new Map(eligible.map((item) => [item.id, item]));
    return orderedIds.map((id) => byId.get(id)!);
  }, [orderedIds, eligible]);
  const matches = useMemo(() => new Map((results ?? []).map((item) => [item.incident_id, item])), [results]);
  const newCount = orderedIncidents.filter((item) => !snapshotIds.has(item.id)).length;

  async function recommend() {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const snapshot = orderedIncidents.slice();
    const ids = snapshot.filter((item) => item.team !== team.name && !item.team_selected_with_ai).map((item) => item.id);
    const requested = new Set(ids);
    setSnapshotIds(new Set(snapshot.map((item) => item.id)));
    setLoading(true); setError("");
    try {
      const data = ids.length ? await analysis.recommendForTeam({ id: team.id, name: team.name, domain: team.domain,
        description: team.description, services: team.services, skills: team.tags }, request.signal, ids) : [];
      if (request.signal.aborted) return;
      const scoped = data.filter((item) => requested.has(item.incident_id) && (!item.team || item.team.id === team.id));
      setResults(scoped);
      const ranked = new Map(scoped.map((item) => [item.incident_id, item]));
      const sorted = snapshot.slice().sort((a, b) => {
        const score = (ranked.get(b.id)?.match_percent ?? 0) - (ranked.get(a.id)?.match_percent ?? 0);
        return score || Number(getIncidentGroups(b).includes("На координаторах"))
          - Number(getIncidentGroups(a).includes("На координаторах"));
      });
      const captured = new Set(snapshot.map((item) => item.id));
      // Ranking changes only on the explicit AI action; arrivals stay after that batch.
      setQueue((current) => ({ ...current,
        ids: [...sorted.map((item) => item.id), ...current.ids.filter((id) => !captured.has(id))] }));
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "ИИ-подбор недоступен.");
    } finally { if (!request.signal.aborted) setLoading(false); }
  }

  return { orderedIncidents, matches, results, loading, error, recommend, newCount, snapshotIds };
}
