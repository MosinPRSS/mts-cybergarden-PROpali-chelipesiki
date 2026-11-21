import { useState } from "react";
import { Incident } from "../../types";
import { formatSla, getIncidentGroups, getPrimaryGroup, getGroupBadgeClass, isIncidentResolved } from "../../lib";
import { Icon } from "../common/Icon";
import { TEAMS_DATA } from "../../data/teams";
import { getRecommendedTeamsForIncident } from "../../lib/teams";

interface DrawerProps {
  incident: Incident;
  seconds: number | null;
  onClose: () => void;
  onResolve?: (incident: Incident) => void;
  onAssignTeam?: (incidentId: string, teamName: string) => void;
}

export function Drawer({ incident, seconds, onClose, onResolve, onAssignTeam }: DrawerProps) {
  const [selectedTeamName, setSelectedTeamName] = useState(incident.team || "");
  const [isChangingTeam, setIsChangingTeam] = useState(false);
  const groups = getIncidentGroups(incident);
  const primary = getPrimaryGroup(incident);

  const recommendations = getRecommendedTeamsForIncident(incident, TEAMS_DATA);
  const topRecommendation = recommendations.length > 0 ? recommendations[0] : null;
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Закрыть панель" />
      <aside className="drawer" aria-label={`Инцидент ${incident.id}`}>
        <div className="drawer-header">
          <div>
            <div className="drawer-kicker">
              <span className={`priority-badge ${getGroupBadgeClass(primary)}`}>{primary}</span>
              <span>{incident.id}</span>
            </div>
            <h2>{incident.service} / {incident.area}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
        </div>
        <div className="drawer-scroll">
          <div className="drawer-summary">
            <div><span>Срок решения</span><strong className={seconds !== null && seconds < 900 && !incident.is_resolved ? "sla-danger" : ""}>{formatSla(seconds, incident.sla_state)}</strong></div>
            <div><span>Влияние</span><strong>{incident.affected}</strong></div>
            <div><span>Статус</span><strong>{incident.state || incident.status || "—"}</strong></div>
          </div>
          <section className="drawer-section">
            <div className="section-title"><h3>Группы внимания</h3></div>
            <div className="group-chips-container">
              {groups.map((group) => <span key={group} className={`group-chip ${getGroupBadgeClass(group)}`}>{group}</span>)}
              {!groups.length && <span>Не входит в четыре группы внимания</span>}
            </div>
          </section>
          <section className="drawer-section">
            <div className="section-title"><h3>Описание инцидента</h3></div>
            <p>{incident.description || incident.summary}</p>
            {incident.sourceService && <p>Сервис: {incident.sourceService}</p>}
          </section>
          <section className="ai-analysis">
            <div className="ai-title"><Icon name="spark" size={17} /><b>ИИ-анализ</b></div>
            <p>{incident.ai || "Анализ ещё не выполнен"}</p>
          </section>
          <section className="drawer-section">
            <div className="section-title"><h3>Даты из ITSM</h3></div>
            <p>Регистрация: {incident.created || "—"}</p>
            <p>Срок решения: {incident.deadline || "Не задан"}</p>
            <p>Завершение: {incident.completionDate || "—"}</p>
            <p>Назначение в команду: {incident.lastAssignmentToTeamDateTime || "—"}</p>
          </section>
          {incident.solution && <section className="drawer-section"><div className="section-title"><h3>Решение из выгрузки</h3></div><p>{incident.solution}</p></section>}
          <section className="drawer-section">
            <div className="section-title"><h3>Ответственные и команда</h3></div>
            <div className="owner-row">
              <span className="avatar">{incident.assignee?.slice(0, 1) || "—"}</span>
              <div>
                <b>{incident.assignee || "Не назначен"}</b>
                <small>{incident.team}</small>
              </div>
            </div>

            {/* AI Assistant recommendation for incident assignment */}
            {topRecommendation && topRecommendation.team.name !== incident.team && !isIncidentResolved(incident) && onAssignTeam && (
              <div className="drawer-ai-rec-box">
                <div className="ai-rec-title">
                  <Icon name="spark" size={14} />
                  <span>Ассистент рекомендует команду:</span>
                </div>
                <div className="ai-rec-body">
                  <strong>{topRecommendation.team.name}</strong>
                  <p>{topRecommendation.reason}</p>
                  <button
                    className="ai-rec-assign-btn"
                    onClick={() => {
                      onAssignTeam(incident.id, topRecommendation.team.name);
                    }}
                  >
                    <Icon name="check" size={13} />
                    Назначить рекомендованную команду
                  </button>
                </div>
              </div>
            )}

            {/* Reassign Team Selector for Coordinator */}
            {!isIncidentResolved(incident) && onAssignTeam && (
              <div className="drawer-assign-controls">
                {!isChangingTeam ? (
                  <button
                    className="change-team-toggle-btn"
                    onClick={() => setIsChangingTeam(true)}
                  >
                    <Icon name="users" size={14} />
                    Изменить команду назначения
                  </button>
                ) : (
                  <div className="drawer-team-selector-form">
                    <label>Выберите команду из реестра:</label>
                    <div className="team-select-row">
                      <select
                        value={selectedTeamName}
                        onChange={(e) => setSelectedTeamName(e.target.value)}
                      >
                        {TEAMS_DATA.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name} ({t.domain})
                          </option>
                        ))}
                      </select>
                      <button
                        className="save-team-btn"
                        onClick={() => {
                          if (selectedTeamName && selectedTeamName !== incident.team) {
                            onAssignTeam(incident.id, selectedTeamName);
                          }
                          setIsChangingTeam(false);
                        }}
                      >
                        Привязать
                      </button>
                      <button
                        className="cancel-team-btn"
                        onClick={() => setIsChangingTeam(false)}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="drawer-actions">
          {!isIncidentResolved(incident) && onResolve && (
            <button
              className="resolve-action"
              onClick={() => onResolve(incident)}
            >
              <Icon name="check" size={16} /> Отметить решённым
            </button>
          )}
          <button className="primary-action" onClick={() => window.open(`https://itsm.mts.ru/incident/${encodeURIComponent(incident.id)}`, "_blank", "noopener,noreferrer")}>Открыть в ITSM <Icon name="external" size={16} /></button>
        </div>
      </aside>
    </div>
  );
}
