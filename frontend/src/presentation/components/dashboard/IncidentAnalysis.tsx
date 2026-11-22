import type { Incident } from "../../../domain/incidents/types.ts";
import { useIncidentSummary } from "../../../application/analysis/useIncidentSummary.ts";
import { Icon } from "../common/Icon";

export function IncidentAnalysis({ incident, onSelectRelated }: {
  incident: Incident;
  onSelectRelated?: (id: string) => void;
}) {
  const { result, loading, error, analyze } = useIncidentSummary(incident);

  return <section className="ai-analysis" aria-busy={loading}>
    <div className="ai-title"><Icon name="spark" size={17} /><b>Краткая сводка ИИ</b></div>
    <p>{result ? <><b>Проблема: </b>{result.summary}</> : "Кратко о проблеме и следующем шаге."}</p>
    {result && <p><b>Следующий шаг: </b>{result.next_step}</p>}
    {result?.related_incidents_used.map((item) => <div className="ai-related" key={item.incident_id}>
      <button type="button" className="text-action" onClick={() => onSelectRelated?.(item.incident_id)}>Похожий случай: {item.incident_id}</button>
      <span>{item.contribution}</span>
    </div>)}
    {!!result?.limitations.length && <p className="ai-limitations">{result.limitations.join(" ")}</p>}
    {result && <small>Анализ на {new Date(result.generated_at).toLocaleString("ru-RU")}. Рекомендации требуют проверки.</small>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary-button" disabled={loading} onClick={analyze}>
      {loading ? "Анализируем…" : result ? "Обновить сводку" : "Составить сводку"}
    </button>
  </section>;
}
