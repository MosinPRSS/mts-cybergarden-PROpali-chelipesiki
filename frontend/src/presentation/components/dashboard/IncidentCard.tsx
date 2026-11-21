import type { Incident } from "../../../domain/incidents/types.ts";
import { formatSla, getGroupBadgeClass } from "../../formatters.ts";
import { getIncidentGroups, getPrimaryGroup, isIncidentResolved } from "../../../domain/incidents/groups.ts";
import { Icon } from "../common/Icon";

interface IncidentCardProps {
  incident: Incident;
  seconds: number | null;
  onClick: () => void;
  onResolve?: (incident: Incident) => void;
}

export function IncidentCard({ incident, seconds, onClick }: IncidentCardProps) {
  const resolved = isIncidentResolved(incident);
  const dangerSla = seconds !== null && seconds < 15 * 60 && !resolved;
  const groups = getIncidentGroups(incident);
  const primary = getPrimaryGroup(incident);
  const badgeClass = groups.length ? getGroupBadgeClass(primary) : resolved ? "resolved" : getGroupBadgeClass(primary);
  const statusLabel = !groups.length && resolved ? "Решён" : primary;
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
          <span className={`priority-badge ${badgeClass}`} title={groups.join(", ")}>
            <i />
            {statusLabel}
          </span>
        </div>
      </div>

      {groups.length > 1 && <div className="card-group-list" aria-label="Дополнительные группы инцидента">
        {groups.filter((group) => group !== primary).map((group) =>
          <span key={group} className={`priority-badge ${getGroupBadgeClass(group)}`}>{group}</span>
        )}
      </div>}

      <div className="service-line" title={[incident.service, incident.area].filter(Boolean).join(" / ")}>
        <h3>{incident.service}</h3>
        {incident.area && <><span>/</span><strong>{incident.area}</strong></>}
      </div>
      <p className="incident-summary" title={incident.summary}>{incident.summary}</p>
      <div className="card-details">
        <span>{incident.state || incident.status || "Статус не указан"}</span>
        <time dateTime={incident.created_at || incident.created}>
          {incident.created_at || incident.created ? new Date(incident.created_at || incident.created!).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Время не указано"}
        </time>
      </div>

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
