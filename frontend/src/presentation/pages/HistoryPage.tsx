import type { Incident } from "../../domain/incidents/types.ts";
import type { Column } from "../models.ts";
import { BoardColumn } from "../components/dashboard/BoardColumn.tsx";
import { filterIncidentHistory } from "../dashboard/selectors.ts";

const historyColumn: Column = {
  key: "История", id: "history", title: "Закрытые инциденты",
  hint: "Сохранены для истории и поиска аналогов", badgeClass: "resolved", priorityRank: 1,
};

export function HistoryPage({ incidents, query, slaFor, onSelectIncident }: {
  incidents: Incident[];
  query: string;
  slaFor: (item: Incident) => number | null;
  onSelectIncident: (incident: Incident) => void;
}) {
  return <>
    <div className="page-heading"><h1>Закрытые инциденты</h1></div>
    <div className="board board-research">
      <BoardColumn column={historyColumn} items={filterIncidentHistory(incidents, query)}
        slaFor={slaFor} onSelectIncident={onSelectIncident} />
    </div>
  </>;
}
