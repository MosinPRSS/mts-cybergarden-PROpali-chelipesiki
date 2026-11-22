import { useMemo, useState } from "react";
import type { Incident } from "../../../domain/incidents/types.ts";
import type { Team } from "../../../domain/teams/types.ts";
import { Icon } from "../common/Icon";
import { useTeamIncidentSelection } from "../../../application/analysis/useTeamIncidentSelection.ts";
import { formatSla, getGroupBadgeClass } from "../../formatters.ts";
import { getPrimaryGroup } from "../../../domain/incidents/groups.ts";

interface AssignIncidentModalProps {
  team: Team;
  incidents: Incident[];
  onClose: () => void;
  onAssign: (incidentId: string, teamName: string, selectedWithAi?: boolean) => void;
  onSelectIncident?: (incident: Incident) => void;
}

export function AssignIncidentModal(props: AssignIncidentModalProps) {
  const { team } = props;
  const profileKey = JSON.stringify([team.id, team.name, team.domain, team.description, team.services, team.tags]);
  return <IncidentSelection key={profileKey} {...props} />;
}

function IncidentSelection({
  team,
  incidents,
  onClose,
  onAssign,
  onSelectIncident,
}: AssignIncidentModalProps) {
  const [search, setSearch] = useState("");
  const [onlyRecommended, setOnlyRecommended] = useState(false);

  const { orderedIncidents, matches, results, loading, error, recommend, newCount, snapshotIds } = useTeamIncidentSelection(team, incidents);

  // Match all active incidents against this team
  const scoredIncidents = useMemo(() => {
    return orderedIncidents.map((incident) => {
      const candidate = matches.get(incident.id);
      const match = candidate?.team?.id === team.id &&
        Date.parse(candidate.incident_updated_at) === Date.parse(incident.updated) ? candidate : undefined;
      const isAlreadyOnThisTeam = incident.team === team.name;
      return {
        incident,
        score: match?.match_percent ?? 0,
        reason: match?.reason ?? "",
        criteria: match?.criteria,
        recommended: Boolean(match?.team) && !incident.team_selected_with_ai,
        isAlreadyOnThisTeam,
      };
    });
  }, [orderedIncidents, team, matches]);

  // Search and filters preserve the stable queue and completed AI ranking.
  const filteredList = useMemo(() => {
    return scoredIncidents
      .filter((item) => {
        if (onlyRecommended && !item.recommended) return false;
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
            disabled={loading || team.id === "coordinators"}
            onClick={() => { setOnlyRecommended(!onlyRecommended); if (!onlyRecommended && results === null) void recommend(); }}
          >
            <Icon name="spark" size={14} />
            Только рекомендации ассистента
          </button>
        </div>

        <div className="modal-team-summary">
          <button className="secondary-button" disabled={loading || team.id === "coordinators"} onClick={recommend}>
            {loading ? "Подбираем инциденты…" : results ? "Обновить ИИ-подбор" : "Подобрать с ИИ"}
          </button>
          {error && <p role="alert">{error}</p>}
          {results && <small>ИИ-подбор завершён для зафиксированного набора инцидентов.</small>}
          {newCount > 0 && <small className="selection-new-arrivals" role="status">
            Новых инцидентов: {newCount}. Добавлены в конец списка. Включить их в анализ можно кнопкой «{results ? "Обновить ИИ-подбор" : "Подобрать с ИИ"}».
          </small>}
        </div>
        <div className="modal-incidents-list">
          {filteredList.length === 0 ? (
            <div className="modal-empty-state">
              <Icon name="spark" size={32} />
              <p>{loading ? "ИИ анализирует инциденты…" : "Нет подходящих активных инцидентов по данному запросу"}</p>
            </div>
          ) : (
            filteredList.map(({ incident, score, reason, criteria, recommended, isAlreadyOnThisTeam }) => {
              const primaryGroup = getPrimaryGroup(incident);
              const badgeClass = getGroupBadgeClass(primaryGroup);
              const isRecommended = recommended;

              return (
                <div
                  key={incident.id}
                  className={`modal-incident-card ${isRecommended ? "recommended-border" : ""}`}
                >
                  <div className="card-top-row">
                    <div className="incident-tags-row">
                      <span className={`priority-badge ${badgeClass}`}>{primaryGroup}</span>
                      <span className="inc-id-tag">{incident.id}</span>
                      {!snapshotIds.has(incident.id) && <span className="selection-new-label">Новый · без анализа</span>}
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
                          onAssign(incident.id, team.name, isRecommended);
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
                        <b>Соответствие по оценке ИИ: {score}%</b>
                      </div>
                      <p>{reason}</p>
                      {criteria && <details className="team-fit-criteria"><summary>Критерии</summary>
                        <div>Продукт/сервис: {criteria.product_service}% · вес 40%</div>
                        <div>Компетенции: {criteria.technical_skills}% · вес 40%</div>
                        <div>Ответственность: {criteria.responsibility}% · вес 20%</div>
                      </details>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
