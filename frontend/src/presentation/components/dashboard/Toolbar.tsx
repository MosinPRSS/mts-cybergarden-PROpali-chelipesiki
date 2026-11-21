import type { IncidentView } from "../../../domain/incidents/types.ts";

interface ToolbarProps {
  totalCount: number;
  researchCount: number;
  myTeamCount: number;
  incidentView: IncidentView;
  onSetIncidentView: (view: IncidentView) => void;
}

export function Toolbar({
  totalCount,
  researchCount,
  myTeamCount,
  incidentView,
  onSetIncidentView,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="view-tabs" aria-label="Представление инцидентов">
        <button
          className={incidentView === "all" ? "active" : ""}
          aria-pressed={incidentView === "all"}
          onClick={() => onSetIncidentView("all")}
        >
          Все группы <span>{totalCount}</span>
        </button>
        <button
          className={incidentView === "research" ? "active" : ""}
          aria-pressed={incidentView === "research"}
          onClick={() => onSetIncidentView("research")}
        >
          Исследование ситуации <span>{researchCount}</span>
        </button>
        <button
          className={incidentView === "team" ? "active" : ""}
          aria-pressed={incidentView === "team"}
          onClick={() => onSetIncidentView("team")}
        >
          Моя команда <span>{myTeamCount}</span>
        </button>
      </div>
    </div>
  );
}
