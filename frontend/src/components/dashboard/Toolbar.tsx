import { DistributionMode } from "../../types";
import { Icon } from "../common/Icon";

interface ToolbarProps {
  totalCount: number;
  myTeamCount: number;
  teamOnly: boolean;
  onToggleTeamOnly: (val: boolean) => void;
  distributionMode: DistributionMode;
  onSetDistributionMode: (mode: DistributionMode) => void;
  columnsCount: number;
}

export function Toolbar({
  totalCount,
  myTeamCount,
  teamOnly,
  onToggleTeamOnly,
  distributionMode,
  onSetDistributionMode,
  columnsCount,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="view-tabs">
        <button
          className={!teamOnly ? "active" : ""}
          onClick={() => onToggleTeamOnly(false)}
        >
          Все инциденты <span>{totalCount}</span>
        </button>
        <button
          className={teamOnly ? "active" : ""}
          onClick={() => onToggleTeamOnly(true)}
        >
          Моя команда <span>{myTeamCount}</span>
        </button>
      </div>

      <div className="mode-toggle">
        <span className="mode-label">Раскладка групп:</span>
        <div className="mode-buttons">
          <button
            className={distributionMode === "significant" ? "active" : ""}
            onClick={() => onSetDistributionMode("significant")}
            title="Карточка раскидывается по самой значимой группе (Критические > На координаторах > Высокий > Исследование)"
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

      <div className="filters">
        <button>
          <Icon name="filter" size={16} />
          Фильтры <span>{columnsCount}</span>
        </button>
        <button>
          За 24 часа <span className="down">⌄</span>
        </button>
      </div>
    </div>
  );
}
