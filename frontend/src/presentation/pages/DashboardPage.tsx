import { useCallback, useMemo, useState } from "react";
import type { AuthUser } from "../../domain/auth.ts";
import type { SummaryWindow } from "../../domain/analysis.ts";
import { useFocusAlerts } from "../../application/analysis/useFocusAlerts.ts";
import type { Incident, IncidentView } from "../../domain/incidents/types.ts";
import { getIncidentGroups } from "../../domain/incidents/groups.ts";
import { remainingSla } from "../../domain/incidents/sla.ts";
import { summaryCandidates } from "../../domain/incidents/summary.ts";
import { useIncidents } from "../../application/incidents/useIncidents.ts";
import type { SnapshotListener } from "../../application/incidents/useIncidents.ts";
import { useIncidentActions } from "../../application/incidents/useIncidentActions.ts";
import { useNotificationCenter } from "../../application/notifications/useNotificationCenter.ts";
import { useClock } from "../hooks/useClock.ts";
import { useDashboardShortcuts } from "../hooks/useDashboardShortcuts.ts";
import { useFeedback } from "../hooks/useFeedback.ts";
import { AlertBanner, Icon, LiveToast } from "../components/common";
import { Header, Sidebar } from "../components/layout";
import { Drawer } from "../components/dashboard";
import { TeamsView } from "../components/teams";
import { BoardPage } from "./BoardPage.tsx";
import { HistoryPage } from "./HistoryPage.tsx";
import { AssistantPage } from "./AssistantPage.tsx";

export function DashboardPage({ user, onLogout, signingOut }: {
  user: AuthUser;
  onLogout: () => void;
  signingOut: boolean;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selected, setSelected] = useState<Incident | null>(null);
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState("board");
  const [focusWindow, setFocusWindow] = useState<SummaryWindow>(30);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const [incidentView, setIncidentView] = useState<IncidentView>("all");
  const clock = useClock();
  const feedback = useFeedback();
  const notifications = useNotificationCenter(user.id, feedback.announce);
  const { receiveSnapshot } = notifications;
  const { reset } = clock;

  const onSnapshot: SnapshotListener = useCallback((previous, data) => {
    receiveSnapshot(previous, data);
    reset();
    setSelected((item) => item ? data.find((fresh) => fresh.id === item.id) || null : null);
  }, [receiveSnapshot, reset]);
  const { incidents, applySavedIncident, initialized } = useIncidents(onSnapshot, feedback.connectionChanged);
  useFocusAlerts(incidents, clock.now, focusWindow, initialized);
  const actions = useIncidentActions(applySavedIncident, feedback.actionFailed, feedback.assigned);
  const closeDrawer = useCallback(() => setSelected(null), []);
  useDashboardShortcuts(closeDrawer);

  const slaFor = useCallback((incident: Incident) => remainingSla(incident, clock.secondsPassed), [clock.secondsPassed]);
  const criticalCount = useMemo(() => incidents.filter((item) => getIncidentGroups(item).includes("Критические")).length, [incidents]);
  const overdueCount = useMemo(() => summaryCandidates(incidents, "overdue", clock.now).length, [incidents, clock.now]);
  const selectById = useCallback((id: string) => {
    const found = incidents.find((item) => item.id === id);
    if (found) setSelected(found);
  }, [incidents]);

  return <div className={`app ${theme}`} data-pwa-busy={actions.savingIds.length > 0 || actions.undoable.length > 0 || signingOut}>
    <Sidebar activeNav={activeNav} onSelectNav={(key) => { setActiveNav(key); closeMobileMenu(); }}
      mobileOpen={mobileMenuOpen} onClose={closeMobileMenu}
      criticalCount={criticalCount} overdueCount={overdueCount} user={user} />
    <main inert={mobileMenuOpen}>
      <Header query={query} onQueryChange={setQuery} theme={theme}
        mobileMenuOpen={mobileMenuOpen} onOpenMenu={() => setMobileMenuOpen(true)}
        onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
        notifications={notifications.notifications} onMarkAsRead={notifications.markAsRead}
        onMarkAllAsRead={notifications.markAllAsRead} onDeleteNotification={notifications.remove}
        onClearAllNotifications={notifications.clear} onSelectIncident={selectById}
        onLogout={onLogout} signingOut={signingOut} user={user} />
      <div className="content">
        {activeNav === "board" && <BoardPage incidents={incidents} query={query} now={clock.now}
          focusWindow={focusWindow} onFocusWindowChange={setFocusWindow}
          incidentView={incidentView} onSetIncidentView={setIncidentView}
          slaFor={slaFor} onSelectIncident={setSelected} onResolveIncident={actions.resolve} />}
        {activeNav === "teams" && <TeamsView incidents={incidents} onAssignTeam={actions.assign} onSelectIncident={setSelected} />}
        {activeNav === "history" && <HistoryPage incidents={incidents} query={query} slaFor={slaFor} onSelectIncident={setSelected} />}
        {activeNav === "analytics" && <AssistantPage incidents={incidents} now={clock.now} onSelectIncident={setSelected} />}
        {!["board", "teams", "history", "analytics"].includes(activeNav) && <div className="module-message">
          <Icon name="history" size={30} /><h2>История инцидентов</h2>
          <p>Раздел доступен из рабочего контура. Вернитесь к активным инцидентам.</p>
          <button onClick={() => setActiveNav("board")}>К доске инцидентов</button>
        </div>}
      </div>
    </main>
    {selected && <Drawer key={selected.id} incident={selected} seconds={slaFor(selected)} onClose={closeDrawer}
      onSelectRelated={selectById} saving={actions.savingIds.includes(selected.id)}
      onResolve={actions.resolve} onUndoResolve={actions.undoResolve} onCloseIncident={actions.close} onAssignTeam={(id, team, selectedWithAi) => actions.assign(id, team, undefined, selectedWithAi)} />}
    {!!actions.undoable.length && <div className="undo-resolve-toasts" aria-live="polite">
      {actions.undoable.map((incident) => <div className="undo-resolve-toast" key={incident.id}>
        <span>Инцидент {incident.id} решён · передан в исследование</span>
        <button className="secondary-button" disabled={actions.savingIds.includes(incident.id)}
          onClick={() => actions.undoResolve(incident)}>Отменить</button>
      </div>)}
    </div>}
    <AlertBanner banner={feedback.alertBanner} onClose={feedback.dismissAlert} />
    <LiveToast status={feedback.liveStatus} />
  </div>;
}
