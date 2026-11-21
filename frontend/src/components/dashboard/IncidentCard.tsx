import { Incident } from "../../types";
import {
  formatSla,
  getIncidentGroups,
  getPrimaryGroup,
  getGroupBadgeClass,
  isIncidentResolved,
} from "../../lib";
import { Icon } from "../common/Icon";

interface IncidentCardProps {
  incident: Incident;
  seconds: number | null;
  onClick: () => void;
  onResolve?: (incident: Incident) => void;
}

export function IncidentCard({
  incident,
  seconds,
  onClick,
  onResolve,
}: IncidentCardProps) {
  const resolved = isIncidentResolved(incident);
  const dangerSla = seconds !== null && seconds < 15 * 60 && !resolved;
  const groups = getIncidentGroups(incident);
  const primary = getPrimaryGroup(incident);
  const otherGroups = groups.filter((g) => g !== primary);
  const badgeClass = getGroupBadgeClass(primary);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`incident-card ${badgeClass}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="card-topline">
        <span className="incident-id">{incident.id}</span>
        <div className="badges">
          {groups.length > 1 && (
            <span
              className="multi-badge"
              title={`Инцидент входит в ${groups.length} группы: ${groups.join(", ")}`}
            >
              <span></span>
              <span></span>
            </span>
          )}
          <span className={`priority-badge ${badgeClass}`}>
            <i />
            {primary}
          </span>
        </div>
      </div>

      <div className="service-line">
        <h3>{incident.service}</h3>
        <span>/</span>
        <strong>{incident.area}</strong>
      </div>
      <p className="incident-summary">{incident.summary}</p>

      {/* Other groups chips if multi-group */}
      {otherGroups.length > 0 && (
        <div className="card-other-groups">
          <span className="other-groups-label">Также в:</span>
          {otherGroups.map((g) => (
            <span key={g} className={`mini-group-chip ${getGroupBadgeClass(g)}`}>
              {g}
            </span>
          ))}
        </div>
      )}

      <div className="card-metrics">
        <div>
          <span className="metric-label">
            <Icon name="clock" size={14} /> SLA
          </span>
          <strong
            className={
              dangerSla
                ? "sla-danger"
                : primary === "Исследование ситуации"
                  ? "sla-resolved"
                  : ""
            }
          >
            {formatSla(seconds, incident.sla_state)}
          </strong>
        </div>
        <div className="metric-right">
          <span className="metric-label">
            <Icon name="activity" size={14} /> Влияние
          </span>
          <strong>{incident.affected}</strong>
        </div>
      </div>

      <div className="team-row">
        <span className="avatar">{incident.assignee?.slice(0, 1) || "К"}</span>
        <div>
          <span>{incident.assignee || incident.team}</span>
          {incident.assignee && <small>{incident.team}</small>}
        </div>
      </div>

      {incident.ai && (
        <div className="ai-pill">
          <Icon name="spark" size={15} />
          <span>
            <b>AI</b> {incident.ai}
          </span>
          <Icon name="chevron" size={14} />
        </div>
      )}

      <div className="card-footer">
        <span>
          {incident.created ? `Создан ${incident.created} · ` : ""}
          {incident.updated}
        </span>
        <Icon name="more" size={17} />
      </div>
    </div>
  );
}
