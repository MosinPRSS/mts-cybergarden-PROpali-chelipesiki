import { useEffect, useState } from "react";
import type { DashboardSummary, Incident } from "../../types";
import { fetchDashboardSummary } from "../../lib/api";
import { formatSla } from "../../lib/formatters";
import { Icon } from "../common/Icon";

const reasons = {
  critical_urgent: "Критический · срок под угрозой",
  critical: "Критический",
  coordinator: "На координаторах",
};

interface AiOverviewProps {
  incidents: Incident[];
  now: number;
  onSelectIncident: (incident: Incident) => void;
}

export function AiOverview({ incidents, now, onSelectIncident }: AiOverviewProps) {
  const [overview, setOverview] = useState<DashboardSummary | null>(null);
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
        const data = await fetchDashboardSummary(controller.signal);
        if (active) setOverview(data);
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    // Briefly coalesce a new incident snapshot and the initial mount.
    const initial = window.setTimeout(load, 300);
    const interval = window.setInterval(load, 60000);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [revision, refresh]);

  const current = new Map(incidents.map((item) => [item.id, item]));
  const highlights = overview?.highlights.filter(({ incident }) => {
    const live = current.get(incident.id);
    return live && live.updated === incident.updated && live.is_active;
  }) ?? [];

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
        <button className="ai-overview-refresh" disabled={loading} onClick={() => setRefresh((value) => value + 1)} aria-label="Обновить ИИ-обзор">
          <Icon name="refresh" size={14} /><span>Обновить</span>
        </button>
      </div>
      <div aria-live="polite">
        <p className="ai-overview-summary">{error ? "Не удалось обновить обзор. Повторите попытку." : loading && !overview ? "Изучаем инциденты, сроки решения и влияние на сервисы…" : overview?.summary}</p>
        {loading && !overview && <div className="ai-overview-skeleton" aria-hidden="true"><span /><span /><span /></div>}
        {highlights.length > 0 && <div className="ai-overview-grid">
          {highlights.map(({ incident, reason, summary }, index) => {
            const live = current.get(incident.id)!;
            const seconds = live.deadline ? Math.ceil((Date.parse(live.deadline) - now) / 1000) : null;
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
        <span><Icon name="filter" size={12} />Критические со сроком &lt; 30 мин → остальные критические → на координаторах</span>
        {overview && <span>{overview.status === "ready" ? `В анализе ${overview.analyzed_count} из ${overview.total_candidates}` : `В очереди ${overview.total_candidates}`}{overview.generated_at && ` · ${new Date(overview.generated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</span>}
      </div>
      {!!overview?.limitations.length && <p className="ai-overview-limitations">{overview.limitations.join(" ")}</p>}
    </section>
  );
}
