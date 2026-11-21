import { useMemo, useState } from "react";
import type { NotificationItem, NotificationType } from "../../../domain/notifications/types.ts";
import { formatNotificationTime } from "../../formatters.ts";
import { Icon } from "../common/Icon";

interface NotificationHistoryProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onSelectIncident?: (incidentId: string) => void;
}

type FilterTab = "all" | "unread" | "critical";

export function NotificationHistory({
  notifications,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onSelectIncident,
}: NotificationHistoryProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const criticalCount = useMemo(
    () => notifications.filter((item) => item.type === "critical").length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case "unread":
        return notifications.filter((item) => !item.read);
      case "critical":
        return notifications.filter((item) => item.type === "critical");
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  const getTypeBadge = (type: NotificationType) => {
    switch (type) {
      case "critical":
        return <span className="notification-type-badge critical">Критический</span>;
      case "assigned":
        return <span className="notification-type-badge assigned">Назначение</span>;
      case "resolved":
        return <span className="notification-type-badge resolved">Решён</span>;
      default:
        return <span className="notification-type-badge info">Инфо</span>;
    }
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case "critical":
        return <span className="notification-icon-dot critical" />;
      case "assigned":
        return <span className="notification-icon-dot assigned" />;
      case "resolved":
        return <span className="notification-icon-dot resolved" />;
      default:
        return <span className="notification-icon-dot info" />;
    }
  };

  return (
    <div
      className="notification-popover"
      role="dialog"
      aria-label="История уведомлений"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="notification-popover-header">
        <div className="notification-title-wrap">
          <div className="notification-title-row">
            <Icon name="bell" size={17} />
            <h3>История уведомлений</h3>
            {unreadCount > 0 && (
              <span className="notification-badge-unread">{unreadCount} новых</span>
            )}
          </div>
          <p className="notification-subtitle">
            Все оперативные оповещения и изменения статусов
          </p>
        </div>
        <button
          className="notification-close-btn"
          onClick={onClose}
          aria-label="Закрыть историю уведомлений"
          title="Закрыть (Esc)"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="notification-toolbar">
        <div className="notification-tabs">
          <button
            className={`notification-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            Все <span>{notifications.length}</span>
          </button>
          <button
            className={`notification-tab ${activeTab === "unread" ? "active" : ""}`}
            onClick={() => setActiveTab("unread")}
          >
            Непрочитанные <span>{unreadCount}</span>
          </button>
          <button
            className={`notification-tab ${activeTab === "critical" ? "active" : ""}`}
            onClick={() => setActiveTab("critical")}
          >
            Критические <span>{criticalCount}</span>
          </button>
        </div>

        <div className="notification-bulk-actions">
          {unreadCount > 0 && (
            <button
              className="notification-text-action"
              onClick={onMarkAllAsRead}
              title="Отметить все как прочитанные"
            >
              <Icon name="check" size={13} />
              Прочитать все
            </button>
          )}
          {notifications.length > 0 && (
            <button
              className="notification-text-action clear-action"
              onClick={onClearAll}
              title="Очистить историю уведомлений"
            >
              <Icon name="trash" size={13} />
              Очистить
            </button>
          )}
        </div>
      </div>

      <div className="notification-list">
        {filteredNotifications.length === 0 ? (
          <div className="notification-empty">
            <div className="notification-empty-icon">
              <Icon name="bell" size={28} />
            </div>
            <h4>Уведомлений нет</h4>
            <p>
              {activeTab === "unread"
                ? "Все уведомления прочитаны"
                : activeTab === "critical"
                  ? "Нет критических уведомлений"
                  : "История уведомлений пуста. Новые события отобразятся автоматически."}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              className={`notification-item ${item.read ? "read" : "unread"} ${item.type}`}
              onClick={() => {
                if (!item.read) onMarkAsRead(item.id);
                if (item.incidentId && onSelectIncident) {
                  onSelectIncident(item.incidentId);
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!item.read) onMarkAsRead(item.id);
                  if (item.incidentId && onSelectIncident) {
                    onSelectIncident(item.incidentId);
                  }
                }
              }}
            >
              <div className="notification-item-indicator">
                {getTypeIcon(item.type)}
              </div>

              <div className="notification-item-content">
                <div className="notification-item-meta">
                  {getTypeBadge(item.type)}
                  {item.incidentId && (
                    <span className="notification-incident-id">{item.incidentId}</span>
                  )}
                  <span
                    className="notification-time"
                    title={new Date(item.timestamp).toLocaleString("ru-RU")}
                  >
                    {formatNotificationTime(item.timestamp)}
                  </span>
                </div>

                <div className="notification-item-text">{item.message}</div>

                {item.incidentId && (
                  <div className="notification-item-link">
                    <span>Открыть карточку</span>
                    <Icon name="chevron" size={12} />
                  </div>
                )}
              </div>

              <div className="notification-item-actions">
                {!item.read && (
                  <span
                    className="notification-unread-dot"
                    title="Не прочитано"
                  />
                )}
                <button
                  className="notification-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  aria-label="Удалить уведомление"
                  title="Удалить"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="notification-popover-footer">
          <span>
            Всего: {notifications.length} · Непрочитанных: {unreadCount}
          </span>
        </div>
      )}
    </div>
  );
}
