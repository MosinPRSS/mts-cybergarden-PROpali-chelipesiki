import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../../../domain/auth.ts";
import type { NotificationItem } from "../../../domain/notifications/types.ts";
import { Icon } from "../common/Icon";
import { NotificationHistory } from "./NotificationHistory";

interface HeaderProps {
  mobileMenuOpen: boolean;
  onOpenMenu: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAllNotifications: () => void;
  onSelectIncident?: (incidentId: string) => void;
  onLogout: () => void;
  signingOut: boolean;
  user: AuthUser;
}

export function Header({
  mobileMenuOpen,
  onOpenMenu,
  query,
  onQueryChange,
  theme,
  onThemeToggle,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAllNotifications,
  onSelectIncident,
  onLogout,
  signingOut,
  user,
}: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <header className="topbar">
      <div className="mobile-brand">
        <span className="brand-mark"><img src="/image.png" alt="МТС" /></span>
        <button id="mobile-menu-toggle" className="icon-button" aria-label="Открыть меню"
          aria-controls="app-sidebar" aria-expanded={mobileMenuOpen}
          onClick={() => { setIsOpen(false); onOpenMenu(); }}>
          <Icon name="menu" />
        </button>
        <b>Incident Command</b>
      </div>

      <div className="search">
        <Icon name="search" size={17} />
        <input
          id="search-box"
          ref={searchRef}
          aria-label="Поиск инцидентов"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Поиск по ID, сервису, группе или описанию"
        />
        {query && <button type="button" className="search-clear" aria-label="Очистить поиск" title="Очистить поиск"
          onClick={() => { onQueryChange(""); searchRef.current?.focus(); }}>
          <Icon name="close" size={15} />
        </button>}
      </div>

      <div className="top-actions">
        <div className="system-health">
          <i />
          {user.full_name}
        </div>

        <button
          className="icon-button theme-toggle"
          onClick={onThemeToggle}
          aria-label="Переключить тему"
          title="Переключить тему"
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>

        <div className="notification-wrapper" ref={popoverRef}>
          <button
            className={`icon-button notification ${unreadCount > 0 ? "has-unread" : ""} ${isOpen ? "active" : ""}`}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Уведомления"
            aria-expanded={isOpen}
            title={unreadCount > 0 ? `Уведомления (${unreadCount} непрочитанных)` : "Уведомления"}
          >
            <Icon name="bell" />
            {unreadCount > 0 && <i />}
          </button>

          {isOpen && (
            <NotificationHistory
              notifications={notifications}
              onClose={() => setIsOpen(false)}
              onMarkAsRead={onMarkAsRead}
              onMarkAllAsRead={onMarkAllAsRead}
              onDelete={onDeleteNotification}
              onClearAll={onClearAllNotifications}
              onSelectIncident={(incidentId) => {
                onSelectIncident?.(incidentId);
                setIsOpen(false);
              }}
            />
          )}
        </div>
        <button className="logout-button" onClick={onLogout} disabled={signingOut} title={`Выйти из аккаунта ${user.login}`}>{signingOut ? "Выходим…" : "Выйти"}</button>
      </div>
    </header>
  );
}
