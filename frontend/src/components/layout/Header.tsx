import { Icon } from "../common/Icon";

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

export function Header({ query, onQueryChange, theme, onThemeToggle }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <span className="brand-mark">М</span>
        <b>Incident Command</b>
      </div>

      <label className="search">
        <Icon name="search" size={17} />
        <input
          id="search-box"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Поиск по ID, сервису, группе или описанию (⌘K)"
        />
        <kbd>⌘ K</kbd>
      </label>

      <div className="top-actions">
        <div className="system-health">
          <i />
          Дашборд координатора
        </div>

        <button
          className="icon-button theme-toggle"
          onClick={onThemeToggle}
          aria-label="Переключить тему"
          title="Переключить тему"
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>

        <button className="icon-button notification" aria-label="Уведомления">
          <Icon name="bell" />
          <i />
        </button>
      </div>
    </header>
  );
}
