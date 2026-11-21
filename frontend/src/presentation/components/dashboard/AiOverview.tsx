import type { Incident } from "../../../domain/incidents/types.ts";
import type { SummaryMode } from "../../../domain/analysis.ts";
import { useDashboardSummary } from "../../../application/analysis/useDashboardSummary.ts";
import { remainingSla } from "../../../domain/incidents/sla.ts";
import { formatSla } from "../../formatters.ts";
import { Icon } from "../common/Icon";

const reasons = {
  critical_urgent: "Критический · срок истекает",
  deadline_soon: "Срок истекает",
  overdue: "Просрочен · подтвердите статус",
};

interface AiOverviewProps {
  incidents: Incident[];
  now: number;
  mode?: SummaryMode;
  onSelectIncident: (incident: Incident) => void;
}

export function AiOverview({ incidents, now, mode = "upcoming", onSelectIncident }: AiOverviewProps) {
  const { overview, loading, error, highlights, candidateCount, refresh } = useDashboardSummary(incidents, now, mode);
  const overdue = mode === "overdue";
  const title = overdue ? "Разбор просроченных инцидентов" : "Решить в ближайшее время";
  const empty = overdue ? "Просроченных активных инцидентов нет." : "Активных инцидентов со сроком в ближайшие 30 минут нет.";

  return (
    <section className={`ai-overview ${overdue ? "ai-overview-overdue" : ""}`} aria-label={title} aria-busy={loading}>
      <div className="ai-overview-header">
        <div className="ai-overview-title">
          <span className="ai-overview-mark"><Icon name="spark" size={21} /></span>
          <div><div className="ai-overview-kicker">АССИСТЕНТ КООРДИНАТОРА</div><h2>{title}</h2></div>
          <span className={`ai-overview-status ${loading ? "is-loading" : ""}`}>
            <i />{loading ? "Анализируем" : error ? "Нет связи" : overview?.status === "ready" ? "ИИ-обзор" : overview?.status === "partial" ? "Частичный ИИ-обзор" : !candidateCount ? "Всё спокойно" : "По правилам"}
          </span>
        </div>
        <button className="ai-overview-refresh" disabled={loading} onClick={refresh} aria-label="Обновить ИИ-обзор">
          <Icon name="refresh" size={14} /><span>Обновить</span>
        </button>
      </div>
      <div aria-live="polite">
        <p className="ai-overview-summary">{error ? "Не удалось обновить ИИ-обзор. Актуальные записи показаны с подсказками по правилам." : overview?.summary || (!candidateCount ? empty : overdue
          ? `Просрочено по данным источника: ${candidateCount}. Сначала подтвердите актуальность статусов.`
          : "Ближайшие сроки: больше нуля и до 30 минут. Просроченные исключены.")}</p>
        {highlights.length > 0 && <div className="ai-overview-grid">
          {highlights.map(({ incident, reason, summary, analyzed }, index) => {
            const seconds = remainingSla(incident, 0, now);
            return <button key={incident.id} className={`ai-focus-card ${reason}`} onClick={() => onSelectIncident(incident)}>
              <div className="ai-focus-top"><span className="ai-focus-rank">{String(index + 1).padStart(2, "0")}</span><span className="ai-focus-reason">{reasons[reason]}</span><Icon name="chevron" size={15} /></div>
              <div className="ai-focus-id">{incident.id}<span><Icon name="clock" size={12} />{formatSla(seconds, incident.sla_state)}</span></div>
              <h3>{incident.summary}</h3>
              <p>{summary}</p>
              <div className="ai-focus-meta"><span>{incident.productName || incident.service}</span><span>Влияние: {incident.affected || "не указано"}</span></div>
              {overdue && <div className="ai-focus-review"><span>{incident.priority} · {incident.team || "Команда не указана"}</span><span>{analyzed ? "ИИ-анализ" : loading ? "Ожидает анализа" : "По правилам"}</span></div>}
            </button>;
          })}
        </div>}
      </div>
      <div className="ai-overview-footer">
        <span><Icon name="filter" size={12} />{overdue ? `Все просроченные активные инциденты: ${candidateCount}` : "До трёх ближайших сроков · до 30 минут · без просроченных"}</span>
        {overview && <span>{`В анализе ${overview.analyzed_count} из ${overview.total_candidates}`}{overview.generated_at && ` · ${new Date(overview.generated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</span>}
      </div>
      {!!overview?.limitations.length && <p className="ai-overview-limitations">{overview.limitations.join(" ")}</p>}
    </section>
  );
}
