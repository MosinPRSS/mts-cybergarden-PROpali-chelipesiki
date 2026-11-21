import type { Incident } from "../../../domain/incidents/types.ts";
import { useDashboardSummary } from "../../../application/analysis/useDashboardSummary.ts";
import { remainingSla } from "../../../domain/incidents/sla.ts";
import { formatSla } from "../../formatters.ts";
import { Icon } from "../common/Icon";

const reasons = {
  critical_urgent: "Критический · срок под угрозой",
  critical: "Критический",
  coordinator: "На координаторах",
  high: "Высокий приоритет",
  research: "Исследование ситуации",
};

interface AiOverviewProps {
  incidents: Incident[];
  now: number;
  onSelectIncident: (incident: Incident) => void;
}

export function AiOverview({ incidents, now, onSelectIncident }: AiOverviewProps) {
  const { overview, loading, error, fresh, highlights, current, refresh } = useDashboardSummary(incidents);

  return (
    <section className="ai-overview" aria-label="ИИ-обзор приоритетных инцидентов" aria-busy={loading}>
      <div className="ai-overview-header">
        <div className="ai-overview-title">
          <span className="ai-overview-mark"><Icon name="spark" size={21} /></span>
          <div><div className="ai-overview-kicker">АССИСТЕНТ КООРДИНАТОРА</div><h2>На что обратить внимание</h2></div>
          <span className={`ai-overview-status ${loading ? "is-loading" : ""}`}>
            <i />{loading ? "Анализируем" : error ? "Нет связи" : overview?.status === "ready" ? "ИИ-обзор" : overview?.status === "empty" ? "Всё спокойно" : "По приоритету"}
          </span>
        </div>
        <button className="ai-overview-refresh" disabled={loading} onClick={refresh} aria-label="Обновить ИИ-обзор">
          <Icon name="refresh" size={14} /><span>Обновить</span>
        </button>
      </div>
      <div aria-live="polite">
        <p className="ai-overview-summary">{error ? "Не удалось обновить обзор. Повторите попытку." : (!fresh || loading) && (!overview || !fresh) ? "Изучаем инциденты, сроки решения и влияние на сервисы…" : overview?.summary}</p>
        {loading && (!overview || !fresh) && <div className="ai-overview-skeleton" aria-hidden="true"><span /><span /><span /></div>}
        {highlights.length > 0 && <div className="ai-overview-grid">
          {highlights.map(({ incident, reason, summary }, index) => {
            const live = current.get(incident.id)!;
            const seconds = remainingSla(live, 0, now);
            return <button key={incident.id} className={`ai-focus-card ${reason}`} onClick={() => onSelectIncident(live)}>
              <div className="ai-focus-top"><span className="ai-focus-rank">0{index + 1}</span><span className="ai-focus-reason">{reasons[reason]}</span><Icon name="chevron" size={15} /></div>
              <div className="ai-focus-id">{incident.id}<span><Icon name="clock" size={12} />{formatSla(seconds, live.sla_state)}</span></div>
              <h3>{incident.summary}</h3>
              <p>{summary}</p>
              <div className="ai-focus-meta"><span>{incident.productName || incident.service}</span><span>Влияние: {incident.affected || "не указано"}</span></div>
            </button>;
          })}
        </div>}
      </div>
      <div className="ai-overview-footer">
        <span><Icon name="filter" size={12} />Критические → на координаторах → высокий приоритет → исследование</span>
        {overview && <span>{overview.status === "ready" ? `В анализе ${overview.analyzed_count} из ${overview.total_candidates}` : `В очереди ${overview.total_candidates}`}{overview.generated_at && ` · ${new Date(overview.generated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</span>}
      </div>
      {fresh && !!overview?.limitations.length && <p className="ai-overview-limitations">{overview.limitations.join(" ")}</p>}
    </section>
  );
}
