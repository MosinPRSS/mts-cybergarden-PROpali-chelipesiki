import type { Incident } from "../incidents/types.ts";
import type { NotificationItem, NotificationType } from "./types.ts";
import { getIncidentGroups, isIncidentResolved } from "../incidents/groups.ts";

export const MAX_NOTIFICATIONS_STORED = 100;

// A snapshot may contain several transitions, including two for the same incident.
export function incidentNotifications(previous: Map<string, Incident>, current: Incident[]): NotificationItem[] {
  const result: NotificationItem[] = [];
  for (const item of current) {
    const before = previous.get(item.id);
    const groups = getIncidentGroups(item);
    const oldGroups = before ? getIncidentGroups(before) : [];
    const add = (type: NotificationType, title: string, message: string) => {
      result.push({ ...createNotification({ type, title, message, incidentId: item.id, service: item.service }),
        id: `${item.id}:${item.updated}:${type}` });
    };
    if (groups.includes("Критические") && !oldGroups.includes("Критические")) {
      add("critical", "Критический инцидент", `Новый критический инцидент ${item.id} (${item.service}). Требует внимания.`);
    }
    if (groups.includes("На координаторах") && !oldGroups.includes("На координаторах")) {
      add("assigned", "Передано координаторам", `Инцидент ${item.id} (${item.service}) назначен координаторам.`);
    }
    if (before && isIncidentResolved(item) && !isIncidentResolved(before)) {
      const critical = oldGroups.includes("Критические");
      add("resolved", critical ? "Критический инцидент решён" : "Инцидент решён",
        `${critical ? "Критический инцидент" : "Инцидент"} ${item.id} (${item.service}) решён. Статус: ${item.state || item.status}.`);
    }
  }
  return result;
}

export function createNotification(params: {
  type: NotificationType;
  title: string;
  message: string;
  incidentId?: string;
  service?: string;
  timestamp?: string;
  read?: boolean;
}): NotificationItem {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    title: params.title,
    message: params.message,
    timestamp: params.timestamp || new Date().toISOString(),
    read: params.read ?? false,
    incidentId: params.incidentId,
    service: params.service,
  };
}

export function seedInitialNotifications(incidents: Incident[]): NotificationItem[] {
  const seeded: NotificationItem[] = [];

  const criticals = incidents.filter((inc) =>
    getIncidentGroups(inc).includes("Критические")
  );

  criticals.forEach((inc) => {
    seeded.push({
      id: `init-crit-${inc.id}`,
      type: "critical",
      title: "Критический инцидент",
      message: `🚨 ${inc.id} (${inc.service}) — ${inc.summary}`,
      timestamp: inc.updated || inc.created || new Date().toISOString(),
      read: false,
      incidentId: inc.id,
      service: inc.service,
    });
  });

  const coordinators = incidents
    .filter(
      (inc) =>
        getIncidentGroups(inc).includes("На координаторах") &&
        !getIncidentGroups(inc).includes("Критические")
    )
    .slice(0, 3);

  coordinators.forEach((inc) => {
    seeded.push({
      id: `init-coord-${inc.id}`,
      type: "assigned",
      title: "На координаторах",
      message: `👤 ${inc.id} (${inc.service}) находится в обработке у координаторов`,
      timestamp: inc.lastAssignmentToTeamDateTime || inc.updated || new Date().toISOString(),
      read: true,
      incidentId: inc.id,
      service: inc.service,
    });
  });

  return seeded.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
