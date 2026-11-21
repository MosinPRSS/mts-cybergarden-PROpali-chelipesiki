import { useMemo, useState } from "react";
import type { Incident, Team } from "../../types";
import { Icon } from "../common/Icon";
import { matchIncidentToTeam } from "../../lib/teams";
import { formatSla, getIncidentGroups, getPrimaryGroup, getGroupBadgeClass, isIncidentActive } from "../../lib";

interface AssignIncidentModalProps {
  team: Team;
  incidents: Incident[];
  onClose: () => void;
  onAssign: (incidentId: string, teamName: string) => void;
  onSelectIncident?: (incident: Incident) => void;
}

export function AssignIncidentModal({
  team,
  incidents,
  onClose,
  onAssign,
  onSelectIncident,
}: AssignIncidentModalProps) {
  const [search, setSearch] = useState("");
  const [onlyRecommended, setOnlyRecommended] = useState(false);

  // Filter only active incidents
  const activeIncidents = useMemo(
    () => incidents.filter(isIncidentActive),
    [incidents]
  );

  // Match all active incidents against this team
  const scoredIncidents = useMemo(() => {
    return activeIncidents.map((incident) => {
      const match = matchIncidentToTeam(incident, team);
      const isAlreadyOnThisTeam = incident.team === team.name;
      const isSittingOnCoordinators = getIncidentGroups(incident).includes("На координаторах");
      return {
        incident,
        score: match.score,
        reason: match.reason,
        isAlreadyOnThisTeam,
        isSittingOnCoordinators,
      };
    });
  }, [activeIncidents, team]);

  // Filter and sort:
  // 1. Not already on this team
  // 2. Matching search query
  // 3. Recommended to the top
  const filteredList = useMemo(() => {
    return scoredIncidents
      .filter((item) => {
        if (onlyRecommended && item.score < 40) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const inc = item.incident;
        return (
          inc.id.toLowerCase().includes(q) ||
          inc.service.toLowerCase().includes(q) ||
          (inc.productName && inc.productName.toLowerCase().includes(q)) ||
          inc.summary.toLowerCase().includes(q) ||
          (inc.area && inc.area.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // High score first
        if (b.score !== a.score) return b.score - a.score;
        // Then coordinators first
        if (b.isSittingOnCoordinators !== a.isSittingOnCoordinators) {
          return b.isSittingOnCoordinators ? 1 : -1;
        }
        return 0;
      });
  }, [scoredIncidents, search, onlyRecommended]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">
              <span>Назначение команды</span>
              <span className="dot-sep">·</span>
              <span className="team-highlight">{team.name}</span>
            </div>
            <h2>Выберите инцидент для привязки</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-team-summary">
          <div className="team-summary-lead">
            <span className="avatar">{team.lead.name.slice(0, 1)}</span>
            <div>
              <b>{team.lead.name}</b>
              <small>{team.lead.role} · {team.channel}</small>
            </div>
          </div>
          <div className="team-summary-services">
            <span>Зона ответственности:</span>
            {team.services.map((s) => (
              <span key={s} className="mini-tag">{s}</span>
            ))}
          </div>
        </div>

        <div className="modal-controls">
          <div className="modal-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Поиск инцидента по номеру, сервису или описанию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button className="clear-search-btn" onClick={() => setSearch("")}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <button
            className={`filter-pill-btn ${onlyRecommended ? "active" : ""}`}
            onClick={() => setOnlyRecommended(!onlyRecommended)}
          >
            <Icon name="spark" size={14} />
            Только рекомендации ассистента
          </button>
        </div>

        <div className="modal-incidents-list">
          {filteredList.length === 0 ? (
            <div className="modal-empty-state">
              <Icon name="spark" size={32} />
              <p>Нет подходящих активных инцидентов по данному запросу</p>
            </div>
          ) : (
            filteredList.map(({ incident, score, reason, isAlreadyOnThisTeam }) => {
              const primaryGroup = getPrimaryGroup(incident);
              const badgeClass = getGroupBadgeClass(primaryGroup);
              const isRecommended = score >= 50;

              return (
                <div
                  key={incident.id}
                  className={`modal-incident-card ${isRecommended ? "recommended-border" : ""}`}
                >
                  <div className="card-top-row">
                    <div className="incident-tags-row">
                      <span className={`priority-badge ${badgeClass}`}>{primaryGroup}</span>
                      <span className="inc-id-tag">{incident.id}</span>
                      {incident.sla !== null && (
                        <span className={`sla-mini-tag ${incident.sla < 900 ? "sla-danger" : ""}`}>
                          <Icon name="clock" size={12} />
                          {formatSla(incident.sla, incident.sla_state)}
                        </span>
                      )}
                    </div>
                    {isAlreadyOnThisTeam ? (
                      <span className="current-team-badge">Уже в этой команде</span>
                    ) : (
                      <button
                        className="assign-confirm-btn"
                        onClick={() => {
                          onAssign(incident.id, team.name);
                          onClose();
                        }}
                      >
                        <Icon name="check" size={15} />
                        Назначить
                      </button>
                    )}
                  </div>

                  <div
                    className="card-main-info"
                    onClick={() => {
                      if (onSelectIncident) {
                        onSelectIncident(incident);
                        onClose();
                      }
                    }}
                  >
                    <h4>{incident.service} {incident.area ? `/ ${incident.area}` : ""}</h4>
                    <p className="summary-text">{incident.summary}</p>
                    <div className="card-current-assignee">
                      <span>Текущая команда: <b>{incident.team}</b></span>
                      {incident.assignee && <span> · Ответственный: {incident.assignee}</span>}
                    </div>
                  </div>

                  {isRecommended && !isAlreadyOnThisTeam && (
                    <div className="ai-suggestion-box">
                      <div className="ai-suggestion-header">
                        <Icon name="spark" size={14} />
                        <b>ИИ-Ассистент рекомендует ({score}% совпадение)</b>
                      </div>
                      <p>{reason}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="modal-footer">
          <span>На сайте 1 роль — Координатор с полным доступом к назначению команд</span>
          <button className="secondary-button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
