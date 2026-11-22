import type { AppServices } from "../application/ports.ts";
import { fetchCurrentUser, login, logout, SESSION_EXPIRED_EVENT } from "../infrastructure/http/authApi.ts";
import { fetchIncidents, resolveIncident, undoResolveIncident, closeIncident, assignIncident, fetchDashboardSummary, fetchIncidentSummary, fetchTeamRecommendation, fetchIncidentsForTeam } from "../infrastructure/http/incidentApi.ts";
import { subscribeToIncidents } from "../infrastructure/browser/incidentStream.ts";
import { loadNotifications, saveNotifications } from "../infrastructure/browser/notificationStorage.ts";
import { playChime } from "../infrastructure/browser/audio.ts";
import { onVisible } from "../infrastructure/browser/lifecycle.ts";
import { registerSW } from "virtual:pwa-register";
import { createBrowserPwa } from "../infrastructure/browser/pwa.ts";

// The composition root is the only place that chooses concrete browser adapters.
export const browserServices: AppServices = {
  pwa: createBrowserPwa(registerSW),
  session: {
    current: fetchCurrentUser,
    login,
    logout,
    onExpired(listener) {
      const handle = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        listener(typeof detail === "string" ? detail : undefined);
      };
      window.addEventListener(SESSION_EXPIRED_EVENT, handle);
      return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handle);
    },
  },
  incidents: { list: fetchIncidents, resolve: resolveIncident, undoResolve: undoResolveIncident, close: closeIncident, assign: assignIncident, subscribe: subscribeToIncidents },
  analysis: { dashboard: fetchDashboardSummary, incident: fetchIncidentSummary, recommendTeam: fetchTeamRecommendation, recommendForTeam: fetchIncidentsForTeam },
  notifications: { load: loadNotifications, save: saveNotifications },
  sound: { play: playChime },
  lifecycle: { onVisible },
};
