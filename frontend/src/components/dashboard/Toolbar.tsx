import { DistributionMode, IncidentView } from "../../types";

interface ToolbarProps {
  totalCount: number;
  researchCount: number;
  myTeamCount: number;
  incidentView: IncidentView;
  onSetIncidentView: (view: IncidentView) => void;
  distributionMode: DistributionMode;
  onSetDistributionMode: (mode: DistributionMode) => void;
}

export function Toolbar({
  totalCount,
  researchCount,
  myTeamCount,
  incidentView,
  onSetIncidentView,
  distributionMode,
  onSetDistributionMode,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="view-tabs" aria-label="Представление инцидентов">
        <button
          className={incidentView === "all" ? "active" : ""}
          aria-pressed={incidentView === "all"}
          onClick={() => onSetIncidentView("all")}
        >
          Все инциденты <span>{totalCount}</span>
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

      {incidentView !== "research" && (
        <div className="mode-toggle">
          <span className="mode-label">Раскладка групп:</span>
          <div className="mode-buttons">
            <button
              className={distributionMode === "significant" ? "active" : ""}
              onClick={() => onSetDistributionMode("significant")}
              title="Карточка отображается в самой значимой группе: Критические > На координаторах > Высокий приоритет"
            >
              По высшей значимости
            </button>
            <button
              className={distributionMode === "multi" ? "active" : ""}
              onClick={() => onSetDistributionMode("multi")}
              title="Карточка отображается во всех группах, в которые она входит (регламент МТС)"
            >
              Во всех группах (мульти)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
