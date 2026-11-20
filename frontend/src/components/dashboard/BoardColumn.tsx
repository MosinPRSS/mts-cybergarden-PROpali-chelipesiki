import { Column, Incident } from "../../types";
import { IncidentCard } from "./IncidentCard";

interface BoardColumnProps {
  column: Column;
  items: Incident[];
  slaFor: (incident: Incident) => number | null;
  onSelectIncident: (incident: Incident) => void;
}

export function BoardColumn({
  column,
  items,
  slaFor,
  onSelectIncident,
}: BoardColumnProps) {
  return (
    <section className={`board-column ${column.badgeClass}`} key={column.key}>
      <div className="column-header">
        <div>
          <i />
          <h2>{column.title}</h2>
          <span>{items.length}</span>
        </div>
        <small>{column.hint}</small>
      </div>

      <div className="column-list">
        {items.map((incident) => (
          <IncidentCard
            key={`${column.key}-${incident.id}`}
            incident={incident}
            seconds={slaFor(incident)}
            onClick={() => onSelectIncident(incident)}
          />
        ))}
        {!items.length && <div className="empty-state">Нет инцидентов</div>}
      </div>
    </section>
  );
}
