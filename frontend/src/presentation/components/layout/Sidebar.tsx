import { useEffect, useRef } from "react";
import { Icon } from "../common/Icon";
import { NAVIGATION_ITEMS } from "../../../data/constants";
import type { AuthUser } from "../../../domain/auth.ts";

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  activeNav: string;
  onSelectNav: (key: string) => void;
  criticalCount: number;
  overdueCount: number;
  user: AuthUser;
}

export function Sidebar({ activeNav, onSelectNav, criticalCount, overdueCount, user, mobileOpen, onClose }: SidebarProps) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const media = window.matchMedia("(max-width: 760px)");
    if (!media.matches) { onClose(); return; }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onResize = () => { if (!media.matches) onClose(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    media.addEventListener("change", onResize);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener("change", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.getElementById("mobile-menu-toggle")?.focus();
    };
  }, [mobileOpen, onClose]);
  return (
    <>
    {mobileOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside id="app-sidebar" ref={panelRef} className={`sidebar ${mobileOpen ? "is-mobile-open" : ""}`}
      role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} aria-label="Главное меню">
      <div className="brand" aria-label="MTS Incident Command">
        <span className="brand-mark">
          <img src="/image.png" alt="МТС" />
        </span>
        <span className="brand-copy">
          Accident
          <br />
          Commander
        </span>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Закрыть меню"><Icon name="close" /></button>
      </div>

      <nav aria-label="Разделы приложения">
        {NAVIGATION_ITEMS.map(({ key, icon, label }) => {
          const count = key === "board" ? criticalCount : key === "analytics" ? overdueCount : 0;
          const badge = count > 0 ? String(count) : "";
          return (
            <button
              key={key}
              className={activeNav === key ? "active" : ""}
              aria-label={key === "analytics" ? `${label}: просроченных инцидентов ${overdueCount}` : label}
              onClick={() => onSelectNav(key)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {badge && <b>{badge}</b>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="operator">
          <span>{user.full_name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span>
          <div>
            <b title={user.full_name}>{user.full_name}</b>
            <small>Координатор</small>
          </div>
          <i />
        </div>
      </div>
    </aside>
    </>
  );
}
