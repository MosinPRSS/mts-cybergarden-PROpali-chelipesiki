import { useState } from "react";
import type { Column } from "../../models.ts";
import type { Incident } from "../../../domain/incidents/types.ts";
import { isResolvedOlderThanDay } from "../../../domain/incidents/groups.ts";
import { sortIncidentsByUrgency } from "../../../domain/incidents/selectors.ts";
import { Icon } from "../common/Icon";
import { IncidentCard } from "./IncidentCard";

interface BoardColumnProps {
  column: Column;
  items: Incident[];
  slaFor: (incident: Incident) => number | null;
  onSelectIncident: (incident: Incident) => void;
  onResolveIncident?: (incident: Incident) => void;
}

export function BoardColumn({
  column,
  items,
  slaFor,
  onSelectIncident,
  onResolveIncident,
}: BoardColumnProps) {
  const [isAccordionOpen, setIsAccordionOpen] = useState(column.key === "Исследование ситуации");

  // Решённые инциденты старше суток скрываются в гармошку в конце списка
  const sortedItems = sortIncidentsByUrgency(items, slaFor);
  const regularItems = sortedItems.filter((item) => !isResolvedOlderThanDay(item));
  const olderResolvedItems = sortedItems.filter((item) => isResolvedOlderThanDay(item));

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
        {regularItems.map((incident) => (
          <IncidentCard
            key={`${column.key}-${incident.id}`}
            incident={incident}
            seconds={slaFor(incident)}
            onClick={() => onSelectIncident(incident)}
            onResolve={onResolveIncident}
          />
        ))}

        {!items.length && <div className="empty-state">Нет инцидентов</div>}

        {/* Гармошка в конце списка для решённых инцидентов старше суток */}
        {olderResolvedItems.length > 0 && (
          <div className="column-accordion">
            <button
              type="button"
              className={`accordion-trigger ${isAccordionOpen ? "open" : ""}`}
              onClick={() => setIsAccordionOpen((prev) => !prev)}
              aria-expanded={isAccordionOpen}
            >
              <div className="accordion-trigger-left">
                <span className={`accordion-chevron-wrapper ${isAccordionOpen ? "rotated" : ""}`}>
                  <Icon name="chevron" size={14} />
                </span>
                <span>Решённые более суток назад</span>
              </div>
              <span className="accordion-count">{olderResolvedItems.length}</span>
            </button>

            {isAccordionOpen && (
              <div className="accordion-content">
                {olderResolvedItems.map((incident) => (
                  <IncidentCard
                    key={`${column.key}-${incident.id}`}
                    incident={incident}
                    seconds={slaFor(incident)}
                    onClick={() => onSelectIncident(incident)}
                    onResolve={onResolveIncident}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
