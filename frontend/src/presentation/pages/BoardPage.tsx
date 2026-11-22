import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { SummaryWindow } from "../../domain/analysis.ts";
import type { Incident, IncidentView } from "../../domain/incidents/types.ts";
import { getIncidentBoardGroups } from "../../domain/incidents/groups.ts";
import { AiOverview, BoardColumn, OverviewStats, Toolbar } from "../components/dashboard";
import { getBoardColumns } from "../dashboard/columns.ts";
import { filterBoardIncidents, getDashboardMetrics } from "../dashboard/selectors.ts";

interface BoardPageProps {
  focusWindow: SummaryWindow;
  onFocusWindowChange: (minutes: SummaryWindow) => void;
  incidents: Incident[];
  query: string;
  now: number;
  incidentView: IncidentView;
  onSetIncidentView: (view: IncidentView) => void;
  slaFor: (incident: Incident) => number | null;
  onSelectIncident: (incident: Incident) => void;
  onResolveIncident: (incident: Incident) => void;
}

export function BoardPage({ incidents, query, now, incidentView,
  onSetIncidentView, slaFor, onSelectIncident, onResolveIncident, focusWindow, onFocusWindowChange }: BoardPageProps) {
  const [hideOverdue, setHideOverdue] = useState(false);
  const filtered = useMemo(() => filterBoardIncidents(incidents, query, incidentView, { hideOverdue, slaFor }),
    [incidents, query, incidentView, hideOverdue, slaFor]);
  const columns = useMemo(() => getBoardColumns(incidents, incidentView), [incidents, incidentView]);
  const metrics = useMemo(() => getDashboardMetrics(incidents, slaFor), [incidents, slaFor]);

  return <>
    <div className="page-heading"><div>
      <h1>Инциденты в фокусе</h1>
    </div></div>
    <AiOverview incidents={incidents} now={now} onSelectIncident={onSelectIncident}
      windowMinutes={focusWindow} onWindowChange={onFocusWindowChange} />
    <OverviewStats criticalCount={metrics.criticalCount} riskCount={metrics.riskCount}
      nearestRiskSla={metrics.nearestRiskSla} workloadCount={metrics.workloadCount}
      resolvedMetCount={metrics.resolvedMetCount} resolvedWithDeadlineCount={metrics.resolvedWithDeadlineCount} />
    <Toolbar totalCount={metrics.totalCount} researchCount={metrics.researchCount} myTeamCount={metrics.myTeamCount}
      incidentView={incidentView} onSetIncidentView={onSetIncidentView}
      hideOverdue={hideOverdue} onToggleHideOverdue={() => setHideOverdue((value) => !value)} />
    <div className={`board ${incidentView === "research" ? "board-research" : ""}`}
      style={{ "--board-columns": columns.length } as CSSProperties}>
      {columns.map((column) => <BoardColumn key={column.key} column={column}
        items={filtered.filter((incident) => incidentView === "research" || getIncidentBoardGroups(incident).includes(column.key))}
        slaFor={slaFor} onSelectIncident={onSelectIncident} onResolveIncident={onResolveIncident} />)}
    </div>
  </>;
}
