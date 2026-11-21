import { Icon } from "../common/Icon";
import { NAVIGATION_ITEMS } from "../../data/constants";

interface SidebarProps {
  activeNav: string;
  onSelectNav: (key: string) => void;
  criticalCount: number;
}

export function Sidebar({ activeNav, onSelectNav, criticalCount }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="MTS Incident Command">
        <span className="brand-mark">
          <img src="/image.png" alt="icon" />
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
          <span>ЕК</span>
          <div>
            <b>Даня Попа</b>
            <small>Старший координатор</small>
          </div>
          <i />
        </div>
      </div>
    </aside>
  );
}
