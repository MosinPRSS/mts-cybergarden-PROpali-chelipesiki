import { Incident } from "../../types";
import {
  formatSla,
  getIncidentBoardGroups,
  getPrimaryGroup,
  getGroupBadgeClass,
  isIncidentResolved,
  isIncidentResearch,
} from "../../lib";
import { Icon } from "../common/Icon";

interface IncidentCardProps {
  incident: Incident;
  seconds: number | null;
  onClick: () => void;
  onResolve?: (incident: Incident) => void;
}

export function IncidentCard({ incident, seconds, onClick }: IncidentCardProps) {
  const resolved = isIncidentResolved(incident);
  const research = isIncidentResearch(incident);
  const dangerSla = seconds !== null && seconds < 15 * 60 && !resolved;
  const groups = getIncidentBoardGroups(incident);
  const primary = research ? "Исследование ситуации" : getPrimaryGroup(incident);
  const badgeClass = resolved ? "resolved" : getGroupBadgeClass(primary);
  const statusLabel = research ? "Исследование" : resolved ? "Решён" : primary;
  const teamLabel = [incident.assignee, incident.team].filter(Boolean).join(" · ") || "Не назначен";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${incident.id}: ${incident.service}. ${statusLabel}. Открыть подробности`}
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
            <span className="multi-badge" title={`Группы: ${groups.join(", ")}`}>
              <span />
              <span />
            </span>
          )}
          <span className={`priority-badge ${badgeClass}`} title={groups.join(", ")}>
            <i />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="service-line" title={[incident.service, incident.area].filter(Boolean).join(" / ")}>
        <h3>{incident.service}</h3>
        {incident.area && <><span>/</span><strong>{incident.area}</strong></>}
      </div>
      <p className="incident-summary" title={incident.summary}>{incident.summary}</p>

      <div className="card-metrics">
        <div>
          <span className="metric-label"><Icon name="clock" size={13} /> SLA</span>
          <strong className={dangerSla ? "sla-danger" : resolved ? "sla-resolved" : ""}>
            {formatSla(seconds, incident.sla_state)}
          </strong>
        </div>
        <div className="metric-right">
          <span className="metric-label"><Icon name="activity" size={13} /> Влияние</span>
          <strong title={incident.affected}>{incident.affected}</strong>
        </div>
      </div>

      <div className="card-owner" title={teamLabel}>
        <Icon name="users" size={13} />
        <span>{teamLabel}</span>
        <Icon name="chevron" size={13} />
      </div>
    </div>
  );
}
