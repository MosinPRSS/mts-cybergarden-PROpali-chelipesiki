import { useState } from "react";
import type { Incident } from "../../../domain/incidents/types.ts";
import type { SummaryMode, SummaryWindow } from "../../../domain/analysis.ts";
import { useDashboardSummary } from "../../../application/analysis/useDashboardSummary.ts";
import { remainingSla } from "../../../domain/incidents/sla.ts";
import { matchesOverdueFilters } from "../../../domain/incidents/summary.ts";
import type { OverdueAge, OverduePriority } from "../../../domain/incidents/summary.ts";
import { formatSla } from "../../formatters.ts";
import { Icon } from "../common/Icon";

const reasons = {
  critical_urgent: "Критический · срок истекает",
  deadline_soon: "Срок истекает",
  overdue: "Просрочен · подтвердите статус",
};

const windows: { minutes: SummaryWindow; label: string }[] = [
  { minutes: 30, label: "До 30 минут" },
  { minutes: 60, label: "До 1 часа" },
  { minutes: 120, label: "До 2 часов" },
  { minutes: 360, label: "До 6 часов" },
  { minutes: 720, label: "До 12 часов" },
  { minutes: 1440, label: "До суток" },
];

interface AiOverviewProps {
  incidents: Incident[];
  now: number;
  mode?: SummaryMode;
  windowMinutes?: SummaryWindow;
  onWindowChange?: (minutes: SummaryWindow) => void;
  onSelectIncident: (incident: Incident) => void;
}

export function AiOverview({ incidents, now, mode = "upcoming", onSelectIncident,
  windowMinutes: selectedWindow, onWindowChange }: AiOverviewProps) {
  const [localWindow, setLocalWindow] = useState<SummaryWindow>(30);
  const windowMinutes = selectedWindow ?? localWindow;
  const setWindowMinutes = onWindowChange ?? setLocalWindow;
  const [priority, setPriority] = useState<OverduePriority>("all");
  const [age, setAge] = useState<OverdueAge>("all");
  const { overview, loading, error, highlights, candidateCount, refresh } = useDashboardSummary(incidents, now, mode, windowMinutes);
  const windowLabel = windows.find((item) => item.minutes === windowMinutes)!.label;
  const overdue = mode === "overdue";
  const visibleHighlights = overdue
    ? highlights.filter(({ incident }) => matchesOverdueFilters(incident, now, priority, age)) : highlights;
  const title = overdue ? "Разбор просроченных инцидентов" : "Решить в ближайшее время";
  const empty = overdue ? "Просроченных активных инцидентов нет." : "Активных инцидентов со сроком в выбранный период нет.";

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
        <div className="ai-overview-actions">
          {overdue && <>
            <label className="ai-overview-window">
              <span>Приоритет</span>
              <select aria-label="Приоритет инцидента" value={priority} onChange={(event) => setPriority(event.target.value as OverduePriority)}>
                <option value="all">Все приоритеты</option>
                <option value="4">Критические</option>
                <option value="3">Высокий</option>
                <option value="2">Средний</option>
                <option value="1">Низкий</option>
              </select>
            </label>
            <label className="ai-overview-window">
              <span>Просрочка</span>
              <select aria-label="Длительность просрочки" value={age} onChange={(event) => setAge(event.target.value as OverdueAge)}>
                <option value="all">За всё время</option>
                <option value="under_hour">Меньше часа</option>
                <option value="one_to_six">От 1 до 6 часов</option>
                <option value="six_to_day">От 6 до 24 часов</option>
                <option value="day_or_more">От суток</option>
              </select>
            </label>
          </>}
          {!overdue && <label className="ai-overview-window">
            <span>До просрочки</span>
            <select aria-label="Время до просрочки" value={windowMinutes} onChange={(event) => setWindowMinutes(Number(event.target.value) as SummaryWindow)}>
              {windows.map(({ minutes, label }) => <option key={minutes} value={minutes}>{label}</option>)}
            </select>
          </label>}
          <button className="ai-overview-refresh" disabled={loading} onClick={refresh} aria-label="Обновить ИИ-обзор">
            <Icon name="refresh" size={14} /><span>Обновить</span>
          </button>
        </div>
      </div>
      <div aria-live="polite">
        <p className="ai-overview-summary">{error ? "Не удалось обновить ИИ-обзор. Актуальные записи показаны с подсказками по правилам." : overview?.summary || (!candidateCount ? empty : overdue
          ? `Просрочено по данным источника: ${candidateCount}. Сначала подтвердите актуальность статусов.`
          : `Срок решения: ${windowLabel.toLowerCase()}. Просроченные исключены.`)}</p>
        {overdue && candidateCount > 0 && visibleHighlights.length === 0 && <p className="ai-overview-empty">Нет инцидентов по выбранным фильтрам.</p>}
        {visibleHighlights.length > 0 && <div className="ai-overview-grid">
          {visibleHighlights.map(({ incident, reason, summary, analyzed }, index) => {
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
        <span><Icon name="filter" size={12} />{overdue ? `Показано ${visibleHighlights.length} из ${candidateCount} просроченных · сначала влияние, затем время просрочки` : `${windowLabel} · сначала влияние, затем остаток срока · до трёх инцидентов`}</span>
        {overview && <span>{`В анализе ${overview.analyzed_count} из ${overview.total_candidates}`}{overview.generated_at && ` · ${new Date(overview.generated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</span>}
      </div>
    </section>
  );
}
