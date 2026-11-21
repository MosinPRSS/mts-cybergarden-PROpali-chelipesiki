import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Incident,
  Column,
  DistributionMode,
  AlertBannerState,
  LiveStatusState,
  NotificationItem,
} from "./types";
import { SIGNIFICANCE_ORDER } from "./data";
import {
  formatSla,
  getIncidentGroups,
  getPrimaryGroup,
  playChime,
  fetchIncidents,
  resolveIncident,
  assignIncident,
  normalizeIncident,
  remainingSla,
  isIncidentActive,
  isIncidentResolved,
  loadNotifications,
  saveNotifications,
  createNotification,
  seedInitialNotifications,
} from "./lib";
import { Icon, AlertBanner, LiveToast } from "./components/common";
import { Sidebar, Header } from "./components/layout";
import {
  OverviewStats,
  Toolbar,
  BoardColumn,
  Drawer,
} from "./components/dashboard";
import { TeamsView } from "./components/teams";

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selected, setSelected] = useState<Incident | null>(null);
  const [query, setQuery] = useState("");
  const [secondsPassed, setSecondsPassed] = useState(0);
  const [activeNav, setActiveNav] = useState("board");
  const [teamOnly, setTeamOnly] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusState | null>(null);
  const [alertBanner, setAlertBanner] = useState<AlertBannerState | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => loadNotifications());

  // 'significant': раскидывать строго по самой значимой группе
  // 'multi': отображать карточку во всех группах одновременно
  const [distributionMode, setDistributionMode] = useState<DistributionMode>("multi");

  const prevIncidentsRef = useRef<Map<string, Incident>>(new Map());

  // Save notifications to localStorage
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  // SLA countdown timer
  useEffect(() => {
    const timer = window.setInterval(() => setSecondsPassed((val) => val + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keyboard shortcut to close drawer or focus search
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
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
    fetchIncidents()
      .then((data) => {
        if (Array.isArray(data)) {
          setIncidents(data);
          setSecondsPassed(0);
          const map = new Map<string, Incident>();
          data.forEach((item) => map.set(item.id, item));
          prevIncidentsRef.current = map;

          setNotifications((prev) => {
            if (prev.length === 0) {
              const seeded = seedInitialNotifications(data);
              saveNotifications(seeded);
              return seeded;
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        console.warn("Could not load /api/incidents initially:", err);
      });

    // 2. SSE live stream connection
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function initSSE() {
      eventSource = new EventSource("/api/incidents/stream");

      eventSource.onopen = () => {
        setLiveStatus({ text: "Live-поток активен", ok: true });
        setTimeout(() => setLiveStatus(null), 3500);
      };

      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          const freshData = Array.isArray(parsed) ? parsed.map(normalizeIncident) : parsed;
          if (Array.isArray(freshData)) {
            const prevMap = prevIncidentsRef.current;
            if (prevMap.size > 0) {
              const newCritical = freshData.find(
                (item: Incident) =>
                  getIncidentGroups(item).includes("Критические") &&
                  !getIncidentGroups(prevMap.get(item.id) || { ...item, groups: [] }).includes("Критические")
              );
              const newlyAssigned = freshData.find((item: Incident) => {
                const prev = prevMap.get(item.id);
                const nowCoord = getIncidentGroups(item).includes("На координаторах");
                const wasCoord = prev ? getIncidentGroups(prev).includes("На координаторах") : false;
                return nowCoord && !wasCoord;
              });
              const newlyResolved = freshData.find((item: Incident) => {
                const prev = prevMap.get(item.id);
                return Boolean(prev) && isIncidentResolved(item) && !isIncidentResolved(prev!);
              });

              if (newCritical) {
                playChime("critical");
                const text = `🚨 Новый критический инцидент ${newCritical.id} (${newCritical.service})! Требует немедленной реакции.`;
                setAlertBanner({
                  type: "critical",
                  text,
                });
                setNotifications((prev) => [
                  createNotification({
                    type: "critical",
                    title: "Критический инцидент",
                    message: text,
                    incidentId: newCritical.id,
                    service: newCritical.service,
                  }),
                  ...prev,
                ]);
                setTimeout(() => setAlertBanner(null), 8000);
              } else if (newlyAssigned) {
                playChime("assigned");
                const text = `👤 Инцидент ${newlyAssigned.id} (${newlyAssigned.service}) передан в группу координаторов!`;
                setAlertBanner({
                  type: "assigned",
                  text,
                });
                setNotifications((prev) => [
                  createNotification({
                    type: "assigned",
                    title: "Передано координаторам",
                    message: text,
                    incidentId: newlyAssigned.id,
                    service: newlyAssigned.service,
                  }),
                  ...prev,
                ]);
                setTimeout(() => setAlertBanner(null), 7000);
              } else if (newlyResolved) {
                playChime("assigned");
                const text = `✅ Инцидент ${newlyResolved.id} решён. Статус: ${newlyResolved.state || newlyResolved.status}.`;
                setAlertBanner({
                  type: "resolved",
                  text,
                });
                setNotifications((prev) => [
                  createNotification({
                    type: "resolved",
                    title: "Инцидент решён",
                    message: text,
                    incidentId: newlyResolved.id,
                    service: newlyResolved.service,
                  }),
                  ...prev,
                ]);
                setTimeout(() => setAlertBanner(null), 6000);
              }
            }

            const newMap = new Map<string, Incident>();
            freshData.forEach((item: Incident) => newMap.set(item.id, item));
            prevIncidentsRef.current = newMap;

            setIncidents(freshData);
            setSecondsPassed(0);
            setLiveStatus({ text: "Данные инцидентов обновлены", ok: true });
            setTimeout(() => setLiveStatus(null), 3000);

            // Keep selected item up to date
            setSelected((prev) => {
              if (!prev) return null;
              const found = freshData.find((item: Incident) => item.id === prev.id);
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

  const slaFor = useCallback(
    (incident: Incident) => remainingSla(incident, secondsPassed),
    [secondsPassed]
  );

  const handleResolve = useCallback(async (incident: Incident) => {
    try {
      await resolveIncident(incident.id);
      playChime("assigned");
      const text = `✅ Инцидент ${incident.id} (${incident.service}) успешно отмечен как решённый!`;
      setAlertBanner({
        type: "resolved",
        text,
      });
      setNotifications((prev) => [
        createNotification({
          type: "resolved",
          title: "Инцидент решён вручную",
          message: text,
          incidentId: incident.id,
          service: incident.service,
        }),
        ...prev,
      ]);
      setTimeout(() => setAlertBanner(null), 6000);

      // Локальное оптимистичное обновление
      const nowIso = new Date().toISOString();
      setIncidents((prev) =>
        prev.map((item) =>
          item.id === incident.id
            ? {
                ...item,
                status: "Resolved",
                state: "Решён",
                is_resolved: true,
                is_active: false,
                completionDate: nowIso,
                updated: nowIso,
              }
            : item
        )
      );
      setSelected((prev) =>
        prev && prev.id === incident.id
          ? {
              ...prev,
              status: "Resolved",
              state: "Решён",
              is_resolved: true,
              is_active: false,
              completionDate: nowIso,
              updated: nowIso,
            }
          : prev
      );
    } catch (err) {
      console.error("Failed to resolve incident:", err);
      setAlertBanner({
        type: "critical",
        text: `Не удалось отметить инцидент ${incident.id} как решённый. Проверьте подключение к серверу.`,
      });
      setTimeout(() => setAlertBanner(null), 5000);
    }
  }, []);

  const handleAssignTeam = useCallback(
    async (incidentId: string, teamName: string, assigneeName?: string) => {
      const inc = incidents.find((i) => i.id === incidentId);
      const serviceName = inc?.service || "";

      playChime("assigned");

      // 1. Live toast notification
      const toastText = `Команда «${teamName}» успешно назначена на инцидент ${incidentId}`;
      setLiveStatus({
        text: toastText,
        ok: true,
      });
      setTimeout(() => setLiveStatus(null), 4000);

      // 2. Alert banner & notification history
      setAlertBanner({
        type: "assigned",
        text: `👥 Инцидент ${incidentId} (${serviceName}) передан команде «${teamName}»!`,
      });
      setNotifications((prev) => [
        createNotification({
          type: "assigned",
          title: "Команда назначена",
          message: `Координатор назначил команду «${teamName}» на инцидент ${incidentId} (${serviceName})`,
          incidentId,
          service: serviceName,
        }),
        ...prev,
      ]);
      setTimeout(() => setAlertBanner(null), 6000);

      // 3. Optimistic local update
      const nowIso = new Date().toISOString();
      setIncidents((prev) =>
        prev.map((item) =>
          item.id === incidentId
            ? {
                ...item,
                team: teamName,
                assignee: assigneeName || item.assignee,
                lastAssignmentToTeamDateTime: nowIso,
                updated: nowIso,
              }
            : item
        )
      );

      setSelected((prev) =>
        prev && prev.id === incidentId
          ? {
              ...prev,
              team: teamName,
              assignee: assigneeName || prev.assignee,
              lastAssignmentToTeamDateTime: nowIso,
              updated: nowIso,
            }
          : prev
      );

      // 4. Remote backend call (non-blocking)
      try {
        await assignIncident(incidentId, teamName, assigneeName);
      } catch (err) {
        console.warn("Could not sync assignment to backend API, maintained locally:", err);
      }
    },
    [incidents]
  );

  const handleMarkAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }, []);

  const handleMarkAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const handleDeleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleSelectIncidentById = useCallback(
    (incidentId: string) => {
      const found = incidents.find((item) => item.id === incidentId);
      if (found) {
        setSelected(found);
      }
    },
    [incidents]
  );

  const filtered = useMemo(
    () =>
      incidents.filter((incident) => {
        const matches = `${incident.id} ${incident.service} ${incident.area} ${incident.summary} ${getIncidentGroups(incident).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const belongs = !teamOnly || getIncidentGroups(incident).includes("На координаторах");
        return matches && belongs;
      }),
    [incidents, query, teamOnly]
  );

  // Dynamic custom groups
  const customGroups = useMemo(() => {
    const custom = new Set<string>();
    incidents.forEach((inc) => {
      getIncidentGroups(inc).forEach((g) => {
        if (!SIGNIFICANCE_ORDER.includes(g)) {
          custom.add(g);
        }
      });
    });
    return Array.from(custom);
  }, [incidents]);

  // All columns: 4 main columns in order of significance + dynamic custom groups
  const allColumns: Column[] = useMemo(() => {
    const base: Column[] = [
      {
        key: "Критические",
        id: "critical",
        title: "Критические",
        hint: "1-й приоритет · Реакция < 15 мин",
        badgeClass: "critical",
        priorityRank: 1,
      },
      {
        key: "На координаторах",
        id: "coordinators",
        title: "На координаторах",
        hint: "2-й приоритет · Маршрутизация в команды",
        badgeClass: "assigned",
        priorityRank: 2,
      },
      {
        key: "Высокий приоритет",
        id: "high",
        title: "Высокий приоритет",
        hint: "3-й приоритет · Под наблюдением",
        badgeClass: "high",
        priorityRank: 3,
      },
      {
        key: "Исследование ситуации",
        id: "resolved",
        title: "Исследование ситуации",
        hint: "4-й приоритет · Разбор причин",
        badgeClass: "resolved",
        priorityRank: 4,
      },
    ];

    const custom: Column[] = customGroups.map((groupName, idx) => ({
      key: groupName,
      id: `custom-${idx}`,
      title: groupName,
      hint: "Дополнительная группа инцидентов",
      badgeClass: "custom",
      priorityRank: 5 + idx,
      isCustom: true,
    }));

    return [...base, ...custom];
  }, [customGroups]);

  // KPI Overview metrics
  const criticalCount = useMemo(
    () => incidents.filter((i) => getIncidentGroups(i).includes("Критические")).length,
    [incidents]
  );

  const riskCount = useMemo(
    () =>
      incidents.filter(
        (i) =>
          isIncidentActive(i) &&
          slaFor(i) !== null &&
          slaFor(i)! < 15 * 60
      ).length,
    [incidents, slaFor]
  );

  const nearestRiskSla = useMemo(() => {
    const activeWithSla = incidents
      .filter((i) => isIncidentActive(i))
      .map((i) => slaFor(i))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    return activeWithSla.length > 0 ? formatSla(activeWithSla[0]) : "—";
  }, [incidents, slaFor]);

  const workloadCount = useMemo(
    () => incidents.filter(isIncidentActive).length,
    [incidents]
  );

  const myTeamCount = useMemo(
    () =>
      incidents.filter(
        (i) =>
          getIncidentGroups(i).includes("На координаторах")
      ).length,
    [incidents]
  );

  return (
    <div className={`app ${theme}`}>
      {/* SIDEBAR */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        criticalCount={criticalCount}
      />

      {/* MAIN */}
      <main>
        <Header
          query={query}
          onQueryChange={setQuery}
          theme={theme}
          onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onDeleteNotification={handleDeleteNotification}
          onClearAllNotifications={handleClearAllNotifications}
          onSelectIncident={handleSelectIncidentById}
        />

        <div className="content">
          {activeNav === "board" && (
            <>
              <div className="page-heading">
                <div>
                  <p>
                    Оперативный центр <span>/</span> Россия
                  </p>
                  <h1>Инциденты в фокусе</h1>
                </div>
              </div>

              {/* OVERVIEW STATS CARDS */}
              <OverviewStats
                criticalCount={criticalCount}
                riskCount={riskCount}
                nearestRiskSla={nearestRiskSla}
                workloadCount={workloadCount}
                resolvedMetCount={incidents.filter((item) => item.sla_state === "met").length}
                resolvedWithDeadlineCount={incidents.filter((item) => item.sla_state === "met" || item.sla_state === "breached").length}
              />

              {/* TOOLBAR & MULTI-GROUP TOGGLE */}
              <Toolbar
                totalCount={incidents.length}
                myTeamCount={myTeamCount}
                teamOnly={teamOnly}
                onToggleTeamOnly={setTeamOnly}
                distributionMode={distributionMode}
                onSetDistributionMode={setDistributionMode}
                columnsCount={allColumns.length}
              />

              {/* BOARD COLUMNS */}
              <div
                className="board"
                style={{
                  gridTemplateColumns: `repeat(${allColumns.length}, minmax(260px, 1fr))`,
                }}
              >
                {allColumns.map((column) => {
                  const items = filtered.filter((incident) => {
                    if (distributionMode === "significant") {
                      return getPrimaryGroup(incident) === column.key;
                    } else {
                      return getIncidentGroups(incident).includes(column.key);
                    }
                  });

                  return (
                    <BoardColumn
                      key={column.key}
                      column={column}
                      items={items}
                      slaFor={slaFor}
                      onSelectIncident={setSelected}
                      onResolveIncident={handleResolve}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* TEAMS MODULE */}
          {activeNav === "teams" && (
            <TeamsView
              incidents={incidents}
              onAssignTeam={handleAssignTeam}
              onSelectIncident={setSelected}
            />
          )}

          {/* OTHER NAV MODULES */}
          {activeNav !== "board" && activeNav !== "teams" && (
            <div className="module-message">
              <Icon
                name={activeNav === "analytics" ? "smart_toy" : "history"}
                size={30}
              />
              <h2>
                {activeNav === "analytics"
                  ? "Ассистент"
                  : "История инцидентов"}
              </h2>
              <p>Раздел доступен из рабочего контура. Вернитесь к активным инцидентам.</p>
              <button onClick={() => setActiveNav("board")}>К доске инцидентов</button>
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
          onResolve={handleResolve}
          onAssignTeam={handleAssignTeam}
        />
      )}

      {/* CRITICAL / ASSIGNED EVENT ALERT BANNER */}
      <AlertBanner banner={alertBanner} onClose={() => setAlertBanner(null)} />

      {/* LIVE TOAST NOTIFICATION */}
      <LiveToast status={liveStatus} />
    </div>
  );
}

export default App;
