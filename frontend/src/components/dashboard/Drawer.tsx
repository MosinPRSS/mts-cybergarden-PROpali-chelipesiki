import { Incident } from "../../types";
import { formatSla, getIncidentGroups, getPrimaryGroup, getGroupBadgeClass, isIncidentResolved } from "../../lib";
import { Icon } from "../common/Icon";

interface DrawerProps {
  incident: Incident;
  seconds: number | null;
  onClose: () => void;
  onResolve?: (incident: Incident) => void;
}

export function Drawer({ incident, seconds, onClose, onResolve }: DrawerProps) {
  const groups = getIncidentGroups(incident);
  const primary = getPrimaryGroup(incident);
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
            <div className="section-title"><h3>Ответственные</h3></div>
            <div className="owner-row"><span className="avatar">{incident.assignee?.slice(0, 1) || "—"}</span><div><b>{incident.assignee || "Не назначен"}</b><small>{incident.team}</small></div></div>
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
