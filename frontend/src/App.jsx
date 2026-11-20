import { useEffect, useMemo, useState } from "react";

const DEFAULT_INCIDENTS = [
  {
    id: "INC-98241",
    priority: "Critical",
    service: "МТС Деньги",
    area: "API Gateway",
    summary: "Резкий рост ошибок 5xx в платежном контуре",
    team: "КЦ ИТ Координаторы",
    assignee: "Алексей Романов",
    sla: 522,
    affected: "≈ 18 400 клиентов",
    ai: "Передать в «ИТ-Инфраструктура»",
    updated: "2 мин назад",
    tags: ["Мульти-группа"],
  },
  {
    id: "INC-98238",
    priority: "Critical",
    service: "МТС Банк",
    area: "Авторизация",
    summary: "Недоступен вход в мобильное приложение",
    team: "Банковские системы",
    sla: 788,
    affected: "≈ 6 200 клиентов",
    ai: "Высокая вероятность срыва SLA",
    updated: "4 мин назад",
  },
  {
    id: "INC-98236",
    priority: "High",
    service: "МТС Live",
    area: "Билетная платформа",
    summary: "Замедление подтверждения новых заказов",
    team: "Digital Platform",
    sla: 2305,
    affected: "Часть пользователей",
    ai: "Проверить очередь payment-events",
    updated: "7 мин назад",
  },
  {
    id: "INC-98233",
    priority: "High",
    service: "МТС Линк",
    area: "Видеоконференции",
    summary: "Деградация качества видео в ЦФО",
    team: "UC Platform",
    assignee: "Ирина Власова",
    sla: 3124,
    affected: "3 региона",
    ai: "Корреляция с изменением CDN",
    updated: "11 мин назад",
  },
  {
    id: "INC-98229",
    priority: "Assigned",
    service: "МТС Маркетолог",
    area: "Кампании",
    summary: "Задержка запуска SMS-рассылок",
    team: "КЦ ИТ Координаторы",
    assignee: "Дмитрий Орлов",
    sla: 4458,
    affected: "12 кампаний",
    ai: "Ожидается ответ от Messaging Core",
    updated: "14 мин назад",
  },
  {
    id: "INC-98221",
    priority: "Assigned",
    service: "МТС ID",
    area: "SSO",
    summary: "Повышенная латентность токенов",
    team: "Identity Platform",
    assignee: "Сергей Волков",
    sla: 6331,
    affected: "p95: 1.8 сек",
    ai: "Риск срыва SLA низкий",
    updated: "19 мин назад",
  },
  {
    id: "INC-98198",
    priority: "Resolved",
    service: "Мой МТС",
    area: "Профиль",
    summary: "Ошибка загрузки истории списаний",
    team: "B2C Digital",
    assignee: "Мария Котова",
    sla: 0,
    affected: "Устранено",
    ai: "Причина: некорректный cache key",
    updated: "Решено 12 мин назад",
  },
];

const columns = [
  { key: "Critical", title: "Критические", hint: "Требуют реакции" },
  { key: "High", title: "Высокий риск", hint: "Под наблюдением" },
  { key: "Assigned", title: "На координаторах", hint: "В работе" },
  { key: "Resolved", title: "Решено", hint: "За последний час" },
];

function Icon({ name, size = 18, className = "" }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    chart: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    moon: <path d="M20.5 15.1A9 9 0 0 1 8.9 3.5 9 9 0 1 0 20.5 15.1Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    external: (
      <>
        <path d="M15 3h6v6M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4L12 3Z" />
        <path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14ZM19 14l-.6 1.4L17 16l1.4.6L19 18l.6-1.4L21 16l-1.4-.6L19 14Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    activity: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
    filter: <path d="M4 5h16M7 12h10M10 19h4" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    refresh: (
      <>
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function formatSla(value) {
  if (value <= 0) return "SLA соблюден";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours
    ? `${hours}ч ${String(minutes).padStart(2, "0")}м`
    : `${minutes}м ${String(seconds).padStart(2, "0")}с`;
}

function IncidentCard({ incident, seconds, onClick }) {
  const dangerSla = seconds > 0 && seconds < 15 * 60;
  return (
    <button className={`incident-card ${incident.priority.toLowerCase()}`} onClick={onClick}>
      <div className="card-topline">
        <span className="incident-id">{incident.id}</span>
        <div className="badges">
          {incident.tags?.map((tag) => (
            <span className="multi-badge" key={tag} title={tag}>
              <span></span>
              <span></span>
            </span>
          ))}
          <span className={`priority-badge ${incident.priority.toLowerCase()}`}>
            <i />
            {incident.priority === "Critical"
              ? "Критический"
              : incident.priority === "High"
                ? "Высокий"
                : incident.priority === "Assigned"
                  ? "Назначен"
                  : "Решено"}
          </span>
        </div>
      </div>

      <div className="service-line">
        <h3>{incident.service}</h3>
        <span>/</span>
        <strong>{incident.area}</strong>
      </div>
      <p className="incident-summary">{incident.summary}</p>

      <div className="card-metrics">
        <div>
          <span className="metric-label">
            <Icon name="clock" size={14} /> SLA
          </span>
          <strong
            className={
              dangerSla ? "sla-danger" : incident.priority === "Resolved" ? "sla-resolved" : ""
            }
          >
            {formatSla(seconds)}
          </strong>
        </div>
        <div className="metric-right">
          <span className="metric-label">
            <Icon name="activity" size={14} /> Влияние
          </span>
          <strong>{incident.affected}</strong>
        </div>
      </div>

      <div className="team-row">
        <span className="avatar">{incident.assignee?.slice(0, 1) || "К"}</span>
        <div>
          <span>{incident.assignee || incident.team}</span>
          {incident.assignee && <small>{incident.team}</small>}
        </div>
      </div>

      <div className="ai-pill">
        <Icon name="spark" size={15} />
        <span>
          <b>AI</b> {incident.ai}
        </span>
        <Icon name="chevron" size={14} />
      </div>
      <div className="card-footer">
        <span>Обновлено {incident.updated}</span>
        <Icon name="more" size={17} />
      </div>
    </button>
  );
}

function Drawer({ incident, seconds, onClose }) {
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={onClose} aria-label="Закрыть панель" />
      <aside className="drawer" aria-label={`Инцидент ${incident.id}`}>
        <div className="drawer-header">
          <div>
            <div className="drawer-kicker">
              <span className={`priority-badge ${incident.priority.toLowerCase()}`}>
                <i />
                {incident.priority === "Critical"
                  ? "Критический"
                  : incident.priority === "High"
                    ? "Высокий"
                    : incident.priority === "Assigned"
                      ? "Назначен"
                      : "Решено"}
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
              <strong>{incident.priority === "Resolved" ? "Решено" : "Диагностика"}</strong>
            </div>
          </div>

          <section className="drawer-section">
            <div className="section-title">
              <h3>Сводка инцидента</h3>
              <span>обновлено сейчас</span>
            </div>
            <p>
              {incident.summary}. Система мониторинга зафиксировала отклонение от базового профиля.
              Инцидент подтвержден первой линией и передан в работу.
            </p>
          </section>

          <section className="ai-analysis">
            <div className="ai-title">
              <span>
                <Icon name="spark" size={17} />
              </span>
              <div>
                <b>AI-анализ</b>
                <small>Уверенность 87%</small>
              </div>
            </div>
            <p>
              Вероятная причина — исчерпание пула подключений на кластере <b>api-gw-prod-03</b> после
              изменения конфигурации.
            </p>
            <div className="recommendation">
              <b>Рекомендация</b>
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
                <time>14:32</time>
                <p>
                  <b>{incident.assignee || "Координатор"}</b> подтвердил инцидент и запустил
                  диагностику.
                </p>
              </div>
              <div>
                <i></i>
                <time>14:29</time>
                <p>
                  <b>AI Copilot</b> обнаружил корреляцию с изменением конфигурации.
                </p>
              </div>
              <div>
                <i></i>
                <time>14:27</time>
                <p>
                  <b>Monitoring</b> создал инцидент по входящему алерту.
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
          <button className="secondary-action">Эскалировать</button>
          <button className="primary-action">
            Открыть в ITSM <Icon name="external" size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [secondsPassed, setSecondsPassed] = useState(0);
  const [activeNav, setActiveNav] = useState("board");
  const [teamOnly, setTeamOnly] = useState(false);
  const [incidents, setIncidents] = useState(DEFAULT_INCIDENTS);
  const [liveStatus, setLiveStatus] = useState(null);

  // SLA countdown timer
  useEffect(() => {
    const timer = window.setInterval(() => setSecondsPassed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keyboard shortcut to close drawer
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") setSelected(null);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("search-box")?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ─── Real-Time Sync with Backend incidents.json ─────────────────────────
  useEffect(() => {
    // 1. Initial snapshot fetch
    fetch("/api/incidents")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setIncidents(data);
          setSecondsPassed(0);
        }
      })
      .catch((err) => {
        console.warn("Could not load /api/incidents initially:", err);
      });

    // 2. SSE live stream connection
    let eventSource = null;
    let reconnectTimer = null;

    function initSSE() {
      eventSource = new EventSource("/api/incidents/stream");

      eventSource.onopen = () => {
        setLiveStatus({ text: "Live-поток активен", ok: true });
        setTimeout(() => setLiveStatus(null), 3500);
      };

      eventSource.onmessage = (e) => {
        try {
          const freshData = JSON.parse(e.data);
          if (Array.isArray(freshData)) {
            setIncidents(freshData);
            setSecondsPassed(0);
            setLiveStatus({ text: "Данные инцидентов обновлены", ok: true });
            setTimeout(() => setLiveStatus(null), 3000);

            // Update selected incident if open
            setSelected((prev) => {
              if (!prev) return null;
              const found = freshData.find((item) => item.id === prev.id);
              return found || prev;
            });
          }
        } catch (err) {
          console.error("Error parsing SSE incident message:", err);
        }
      };

      eventSource.onerror = () => {
        setLiveStatus({ text: "Переподключение к серверу...", ok: false });
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimer = setTimeout(initSSE, 4000);
      };
    }

    initSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  const slaFor = (incident) => Math.max(0, incident.sla - secondsPassed);

  const filtered = useMemo(
    () =>
      incidents.filter((incident) => {
        const matches = `${incident.id} ${incident.service} ${incident.area} ${incident.summary}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const belongs = !teamOnly || incident.team === "КЦ ИТ Координаторы";
        return matches && belongs;
      }),
    [incidents, query, teamOnly],
  );

  // Dynamic overview metrics
  const criticalCount = useMemo(
    () => incidents.filter((i) => i.priority === "Critical").length,
    [incidents],
  );

  const riskCount = useMemo(
    () =>
      incidents.filter((i) => i.priority !== "Resolved" && i.sla > 0 && slaFor(i) < 15 * 60).length,
    [incidents, secondsPassed],
  );

  const nearestRiskSla = useMemo(() => {
    const activeWithSla = incidents
      .filter((i) => i.priority !== "Resolved" && i.sla > 0)
      .map((i) => slaFor(i))
      .sort((a, b) => a - b);
    return activeWithSla.length > 0 ? formatSla(activeWithSla[0]) : "—";
  }, [incidents, secondsPassed]);

  const workloadCount = useMemo(
    () => incidents.filter((i) => i.priority !== "Resolved").length,
    [incidents],
  );

  const myTeamCount = useMemo(
    () => incidents.filter((i) => i.team === "КЦ ИТ Координаторы").length,
    [incidents],
  );

  return (
    <div className={`app ${theme}`}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand" aria-label="MTS Incident Command">
          <span className="brand-mark">М</span>
          <span className="brand-copy">
            Incident
            <br />
            Command
          </span>
        </div>
        <nav>
          {[
            ["board", "grid", "Инциденты", criticalCount ? String(criticalCount) : ""],
            ["analytics", "chart", "Аналитика", ""],
            ["teams", "users", "Команды", ""],
            ["history", "history", "История", ""],
          ].map(([key, icon, label, badge]) => (
            <button
              key={key}
              className={activeNav === key ? "active" : ""}
              onClick={() => setActiveNav(key)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {badge && <b>{badge}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button>
            <Icon name="settings" />
            <span>Настройки</span>
          </button>
          <div className="operator">
            <span>ЕК</span>
            <div>
              <b>Елена Котова</b>
              <small>Старший координатор</small>
            </div>
            <i />
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main>
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по ID, сервису или описанию (⌘K)"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="top-actions">
            <div className="system-health">
              <i />
              Все системы мониторинга активны
            </div>
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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

        <div className="content">
          <div className="page-heading">
            <div>
              <p>
                Оперативный центр <span>/</span> Россия
              </p>
              <h1>Активные инциденты</h1>
            </div>
            <div className="shift">
              <span>Текущая смена</span>
              <div className="shift-avatars">
                <i>ЕК</i>
                <i>АР</i>
                <i>МВ</i>
                <i>+3</i>
              </div>
              <b>6 координаторов</b>
            </div>
          </div>

          {/* OVERVIEW STATS CARDS */}
          <div className="overview">
            <div className="overview-item critical">
              <span className="overview-icon">
                <Icon name="activity" />
              </span>
              <div>
                <small>Критические</small>
                <strong>{criticalCount}</strong>
              </div>
              <em>+{criticalCount > 0 ? "1" : "0"} за час</em>
            </div>
            <div className="overview-item risk">
              <span className="overview-icon">
                <Icon name="clock" />
              </span>
              <div>
                <small>Риск SLA</small>
                <strong>{riskCount}</strong>
              </div>
              <em>Следующий: {nearestRiskSla}</em>
            </div>
            <div className="overview-item workload">
              <span className="overview-icon">
                <Icon name="users" />
              </span>
              <div>
                <small>В работе</small>
                <strong>{workloadCount}</strong>
              </div>
              <em>{Math.min(100, Math.round((workloadCount / 6) * 100))}% загрузки</em>
            </div>
            <div className="overview-item quality">
              <div className="sla-ring">
                94<small>%</small>
              </div>
              <div>
                <small>SLA сегодня</small>
                <strong>47 / 50</strong>
              </div>
              <em>+2.4% к вчера</em>
            </div>
          </div>

          {/* TOOLBAR */}
          <div className="toolbar">
            <div className="view-tabs">
              <button className={!teamOnly ? "active" : ""} onClick={() => setTeamOnly(false)}>
                Все инциденты <span>{incidents.length}</span>
              </button>
              <button className={teamOnly ? "active" : ""} onClick={() => setTeamOnly(true)}>
                Моя команда <span>{myTeamCount}</span>
              </button>
            </div>
            <div className="filters">
              <button>
                <Icon name="filter" size={16} />
                Фильтры <span>2</span>
              </button>
              <button>
                За 24 часа <span className="down">⌄</span>
              </button>
            </div>
          </div>

          {/* OTHER NAV MODULES */}
          {activeNav !== "board" && (
            <div className="module-message">
              <Icon
                name={
                  activeNav === "analytics" ? "chart" : activeNav === "teams" ? "users" : "history"
                }
                size={30}
              />
              <h2>
                {activeNav === "analytics"
                  ? "Аналитика"
                  : activeNav === "teams"
                    ? "Команды"
                    : "История инцидентов"}
              </h2>
              <p>Раздел доступен из рабочего контура. Вернитесь к активным инцидентам.</p>
              <button onClick={() => setActiveNav("board")}>К доске инцидентов</button>
            </div>
          )}

          {/* BOARD COLUMNS */}
          {activeNav === "board" && (
            <div className="board">
              {columns.map((column) => {
                const items = filtered.filter((incident) => incident.priority === column.key);
                return (
                  <section className={`board-column ${column.key.toLowerCase()}`} key={column.key}>
                    <div className="column-header">
                      <div>
                        <i />
                        <h2>{column.title}</h2>
                        <span>{items.length}</span>
                      </div>
                      <small>{column.hint}</small>
                    </div>
                    <div className="column-list">
                      {items.map((incident) => (
                        <IncidentCard
                          key={incident.id}
                          incident={incident}
                          seconds={slaFor(incident)}
                          onClick={() => setSelected(incident)}
                        />
                      ))}
                      {!items.length && <div className="empty-state">Нет инцидентов</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* DRAWER */}
      {selected && (
        <Drawer
          incident={selected}
          seconds={slaFor(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* LIVE TOAST NOTIFICATION */}
      {liveStatus && (
        <div className={`live-toast ${liveStatus.ok ? "ok" : "err"}`}>
          <i />
          <span>{liveStatus.text}</span>
        </div>
      )}
    </div>
  );
}
