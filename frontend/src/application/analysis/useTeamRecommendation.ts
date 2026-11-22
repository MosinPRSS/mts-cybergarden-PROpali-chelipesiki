import { useEffect, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import type { TeamCandidate, TeamRecommendation } from "../../domain/teams/types.ts";
import { useServices } from "../servicesContext.ts";

export function useTeamRecommendation(incident: Incident, teams: TeamCandidate[]) {
  const { analysis } = useServices();
  const [result, setResult] = useState<TeamRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function recommend() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await analysis.recommendTeam(incident.id, teams, request.signal);
      if (request.signal.aborted) return;
      if (data.incident_id !== incident.id || Date.parse(data.incident_updated_at) !== Date.parse(incident.updated)) {
        throw new Error("Данные изменились. Повторите подбор.");
      }
      const chosen = data.team;
      if (chosen && !teams.some((team) => team.id === chosen.id && team.name === chosen.name)) {
        throw new Error("Команды нет в реестре. Повторите подбор.");
      }
      setResult(data);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "ИИ-подбор недоступен.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return { result, loading, error, recommend };
}
