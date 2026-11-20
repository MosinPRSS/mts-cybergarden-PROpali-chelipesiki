import React, { useState } from "react";
import { Incident } from "../../types";
import { formatSla, getIncidentGroups, getPrimaryGroup, getGroupBadgeClass } from "../../lib";
import { PRESET_GROUPS } from "../../data/constants";
import { Icon } from "../common/Icon";

interface DrawerProps {
  incident: Incident;
  seconds: number;
  onClose: () => void;
  onAddGroup: (incidentId: string, groupName: string) => void;
  onRemoveGroup: (incidentId: string, groupName: string) => void;
}

export function Drawer({
  incident,
  seconds,
  onClose,
  onAddGroup,
  onRemoveGroup,
}: DrawerProps) {
  const [newGroupInput, setNewGroupInput] = useState("");
  const currentGroups = getIncidentGroups(incident);
  const primary = getPrimaryGroup(incident);

  const handleSubmitGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newGroupInput.trim();
    if (clean) {
      onAddGroup(incident.id, clean);
      setNewGroupInput("");
    }
  };

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Закрыть панель" />
      <aside className="drawer" aria-label={`Инцидент ${incident.id}`}>
        <div className="drawer-header">
          <div>
            <div className="drawer-kicker">
              <span className={`priority-badge ${getGroupBadgeClass(primary)}`}>
                <i />
                {primary}
              </span>
              <span>{incident.id}</span>
            </div>
            <h2>
              {incident.service} / {incident.area}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-scroll">
          <div className="drawer-summary">
            <div>
              <span>Осталось по SLA</span>
              <strong className={seconds < 900 && seconds > 0 ? "sla-danger" : ""}>
                {formatSla(seconds)}
              </strong>
            </div>
            <div>
              <span>Влияние</span>
              <strong>{incident.affected}</strong>
            </div>
            <div>
              <span>Статус</span>
              <strong>
                {currentGroups.includes("Исследование ситуации")
                  ? "Решено (анализ)"
                  : "В работе"}
              </strong>
            </div>
          </div>

          {/* MULTI-GROUP MANAGEMENT */}
          <section className="drawer-section">
            <div className="section-title">
              <h3>Группы инцидента (мультигруппировка)</h3>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                {currentGroups.length} {currentGroups.length === 1 ? "группа" : "группы"}
              </span>
            </div>

            <div className="group-chips-container">
              {currentGroups.map((grp) => (
                <span key={grp} className={`group-chip ${getGroupBadgeClass(grp)}`}>
                  <i />
                  <span>{grp}</span>
                  {currentGroups.length > 1 && (
                    <button
                      type="button"
                      className="chip-remove"
                      title={`Удалить из группы «${grp}»`}
                      onClick={() => onRemoveGroup(incident.id, grp)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="add-group-widget">
              <div className="preset-groups">
                <span className="preset-label">Быстрое добавление:</span>
                {PRESET_GROUPS.filter((p) => !currentGroups.includes(p)).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-btn"
                    onClick={() => onAddGroup(incident.id, preset)}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmitGroup} className="custom-group-form">
                <input
                  type="text"
                  placeholder="Имя новой группы (напр. ИТ-Инфраструктура)..."
                  value={newGroupInput}
                  onChange={(e) => setNewGroupInput(e.target.value)}
                />
                <button type="submit" disabled={!newGroupInput.trim()}>
                  <Icon name="spark" size={13} /> Добавить
                </button>
              </form>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-title">
              <h3>Сводка инцидента</h3>
              <span>{incident.created ? `Возник в ${incident.created}` : "обновлено сейчас"}</span>
            </div>
            <p>
              {incident.summary}. Система мониторинга зафиксировала отклонение от базового профиля.
              Инцидент подтвержден координатором и поставлен на отслеживание.
            </p>
          </section>

          <section className="ai-analysis">
            <div className="ai-title">
              <span>
                <Icon name="spark" size={17} />
              </span>
              <div>
                <b>AI-анализ</b>
                <small>Уверенность 91%</small>
              </div>
            </div>
            <p>
              Предиктивный модуль: {incident.ai}. Рекомендуется проверить смежные очереди сообщений
              и обновить статус в ITSM.
            </p>
            <div className="recommendation">
              <b>Рекомендация координатору</b>
              <span>{incident.ai}</span>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-title">
              <h3>Хронология</h3>
              <button>Вся история</button>
            </div>
            <div className="timeline">
              <div>
                <i></i>
                <time>{incident.created || "14:27"}</time>
                <p>
                  <b>{incident.assignee || "Координатор"}</b> подтвердил инцидент и запустил
                  маршрутизацию.
                </p>
              </div>
              <div>
                <i></i>
                <time>AI Model</time>
                <p>
                  <b>AI Copilot:</b> «{incident.ai}».
                </p>
              </div>
              <div>
                <i></i>
                <time>Monitoring</time>
                <p>
                  <b>Monitoring:</b> зафиксирован алерт в зоне «{incident.service} / {incident.area}».
                </p>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-title">
              <h3>Ответственные</h3>
            </div>
            <div className="owner-row">
              <span className="avatar">{incident.assignee?.slice(0, 1) || "К"}</span>
              <div>
                <b>{incident.assignee || "Дежурный координатор"}</b>
                <small>{incident.team}</small>
              </div>
              <span className="online">В работе</span>
            </div>
          </section>
        </div>

        <div className="drawer-actions">
          <button
            className="secondary-action"
            onClick={() => onAddGroup(incident.id, "Эскалировано")}
          >
            Эскалировать
          </button>
          <button
            className="primary-action"
            onClick={() => {
              window.open(
                `https://itsm.mts.ru/incident/${incident.id}`,
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            Открыть в ITSM <Icon name="external" size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}
