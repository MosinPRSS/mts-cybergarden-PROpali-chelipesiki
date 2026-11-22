import { useMemo } from "react";
import type { Incident } from "../../../domain/incidents/types.ts";
import type { Team } from "../../../domain/teams/types.ts";
import { Icon } from "../common/Icon";
import { getRecommendedIncidentsForTeam } from "../../../domain/teams/matching.ts";
import { isIncidentActive, getIncidentGroups, getPrimaryGroup } from "../../../domain/incidents/groups.ts";
import { getGroupBadgeClass } from "../../formatters.ts";

interface TeamCardProps {
  team: Team;
  incidents: Incident[];
  onOpenAssignModal?: (team: Team) => void;
  onSelectIncident: (incident: Incident) => void;
}

export function TeamCard({
  team,
  incidents,
  onOpenAssignModal,
  onSelectIncident,
}: TeamCardProps) {
  // Current active incidents assigned to this team
  const assignedActiveIncidents = useMemo(
    () => incidents.filter((i) => i.team === team.name && isIncidentActive(i)),
    [incidents, team.name]
  );

  // Critical incidents count on this team
  const criticalCount = useMemo(
    () =>
      assignedActiveIncidents.filter((i) =>
        getIncidentGroups(i).includes("Критические")
      ).length,
    [assignedActiveIncidents]
  );

  // AI-recommended unassigned / sitting-on-coordinator incidents for this team
  const recommendations = useMemo(
    () => getRecommendedIncidentsForTeam(team, incidents),
    [team, incidents]
  );

  const statusLabel = {
    on_duty: "На дежурстве 24/7",
    busy: "Повышенная загрузка",
    standby: "В резерве / On-Call",
  }[team.status];

  const statusClass = {
    on_duty: "status-active",
    busy: "status-busy",
    standby: "status-standby",
  }[team.status];

  return (
    <div className={`team-card ${criticalCount > 0 ? "has-critical" : ""}`}>
      {/* CARD HEADER */}
      <div className="team-card-header">
        <div>
          <span className="team-domain-tag">{team.domain}</span>
          <h3 className="team-title">{team.name}</h3>
        </div>
        <span className={`duty-status-pill ${statusClass}`}>
          <i />
          {statusLabel}
        </span>
      </div>

      <p className="team-desc">{team.description}</p>

      {/* DUTY LEAD */}
      <div className="team-lead-box">
        <span className="team-lead-avatar">{team.lead.name.slice(0, 1)}</span>
        <div className="team-lead-info">
          <b>{team.lead.name}</b>
          <small>{team.lead.role} · {team.shiftSchedule}</small>
        </div>
        <div className="team-lead-contacts">
          {team.channel && (
            <span className="contact-chip" title="Оперативный канал">
              {team.channel}
            </span>
          )}
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="team-metrics-row">
        <div className="metric-box">
          <span>В работе</span>
          <strong className={assignedActiveIncidents.length > 5 ? "warn" : ""}>
            {assignedActiveIncidents.length}
          </strong>
        </div>
        <div className="metric-box">
          <span>Критических</span>
          <strong className={criticalCount > 0 ? "danger-text" : ""}>
            {criticalCount}
          </strong>
        </div>
        <div className="metric-box">
          <span>Состав</span>
          <strong>{team.membersCount} чел.</strong>
        </div>
      </div>

      {/* SERVICES & COMPETENCIES */}
      <div className="team-services-section">
        <span className="section-subtitle">Сервисы и домены:</span>
        <div className="service-tags-wrap">
          {team.services.map((svc) => (
            <span key={svc} className="service-tag">
              {svc}
            </span>
          ))}
        </div>
      </div>

      {/* CURRENTLY ASSIGNED INCIDENTS LIST */}
      <div className="team-incidents-section">
        <div className="section-title-row">
          <span className="section-subtitle">
            Инциденты на команде ({assignedActiveIncidents.length}):
          </span>
        </div>
        {assignedActiveIncidents.length === 0 ? (
          <p className="no-incidents-hint">Нет активных инцидентов</p>
        ) : (
          <div className="team-incidents-chips">
            {assignedActiveIncidents.slice(0, 4).map((inc) => {
              const primary = getPrimaryGroup(inc);
              return (
                <button
                  key={inc.id}
                  className={`team-inc-chip ${getGroupBadgeClass(primary)}`}
                  onClick={() => onSelectIncident(inc)}
                  title={`${inc.service} — ${inc.summary}`}
                >
                  <span className="inc-id">{inc.id}</span>
                  <span className="inc-svc">{inc.service}</span>
                </button>
              );
            })}
            {assignedActiveIncidents.length > 4 && (
              <span className="more-inc-counter">
                +{assignedActiveIncidents.length - 4} ещё
              </span>
            )}
          </div>
        )}
      </div>

      {/* ACTION FOOTER */}
      <div className="team-card-footer">
        <button
          className="assign-team-btn"
          disabled={!onOpenAssignModal}
          onClick={() => onOpenAssignModal?.(team)}
        >
          <Icon name="users" size={15} />
          Привязать инцидент
        </button>
      </div>
    </div>
  );
}
