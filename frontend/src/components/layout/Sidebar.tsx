import { Icon } from "../common/Icon";
import { NAVIGATION_ITEMS } from "../../data/constants";
import type { AuthUser } from "../../types";

interface SidebarProps {
  activeNav: string;
  onSelectNav: (key: string) => void;
  criticalCount: number;
  user: AuthUser;
}

export function Sidebar({ activeNav, onSelectNav, criticalCount, user }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="MTS Incident Command">
        <span className="brand-mark">
          <img src="/image.png" alt="МТС" />
        </span>
        <span className="brand-copy">
          Incident
          <br />
          Command
        </span>
      </div>

      <nav>
        {NAVIGATION_ITEMS.map(({ key, icon, label }) => {
          const badge = key === "board" && criticalCount > 0 ? String(criticalCount) : "";
          return (
            <button
              key={key}
              className={activeNav === key ? "active" : ""}
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
  );
}
