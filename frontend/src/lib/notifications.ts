import type { Incident, NotificationItem, NotificationType } from "../types/index.ts";
import { getIncidentGroups } from "./groups.ts";

export const NOTIFICATIONS_STORAGE_KEY = "mts_notifications_history";
export const MAX_NOTIFICATIONS_STORED = 100;

export function loadNotifications(): NotificationItem[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to load notifications from localStorage:", err);
  }
  return [];
}

export function saveNotifications(notifications: NotificationItem[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const sliced = notifications.slice(0, MAX_NOTIFICATIONS_STORED);
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(sliced));
  } catch (err) {
    console.warn("Failed to save notifications to localStorage:", err);
  }
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

export function formatNotificationTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) {
    return "только что";
  }
  if (diffSec < 3600) {
    const min = Math.floor(diffSec / 60);
    return `${min} мин. назад`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} ч. назад`;
  }

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${d}.${m}, ${h}:${min}`;
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
