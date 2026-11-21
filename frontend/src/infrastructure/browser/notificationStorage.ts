import type { NotificationItem } from "../../domain/notifications/types.ts";
import { MAX_NOTIFICATIONS_STORED } from "../../domain/notifications/events.ts";

export const NOTIFICATIONS_STORAGE_KEY = "mts_notifications_history";

export function loadNotifications(userId?: number): NotificationItem[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(userId === undefined ? NOTIFICATIONS_STORAGE_KEY : `${NOTIFICATIONS_STORAGE_KEY}:${userId}`);
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

export function saveNotifications(notifications: NotificationItem[], userId?: number): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const sliced = notifications.slice(0, MAX_NOTIFICATIONS_STORED);
    window.localStorage.setItem(userId === undefined ? NOTIFICATIONS_STORAGE_KEY : `${NOTIFICATIONS_STORAGE_KEY}:${userId}`, JSON.stringify(sliced));
  } catch (err) {
    console.warn("Failed to save notifications to localStorage:", err);
  }
}

