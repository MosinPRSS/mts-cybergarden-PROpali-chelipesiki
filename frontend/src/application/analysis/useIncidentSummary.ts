import { useEffect, useRef, useState } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import type { IncidentSummary } from "../../domain/analysis.ts";
import { useServices } from "../servicesContext.ts";

export function useIncidentSummary(incident: Incident) {
  const { analysis } = useServices();
  const [result, setResult] = useState<IncidentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function analyze() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const data = await analysis.incident(incident.id, request.signal);
      if (request.signal.aborted) return;
      if (data.incident_id !== incident.id || Date.parse(data.incident_updated_at) !== Date.parse(incident.updated)) {
        throw new Error("Данные изменились. Обновите карточку и повторите анализ.");
      }
      setResult(data);
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "Не удалось выполнить анализ.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return { result, loading, error, analyze };
}
