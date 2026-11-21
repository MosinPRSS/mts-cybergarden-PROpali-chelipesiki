import { useCallback, useEffect, useState } from "react";
import type { NotificationItem } from "../../domain/notifications/types.ts";
import type { SnapshotListener } from "../incidents/useIncidents.ts";
import { incidentNotifications, MAX_NOTIFICATIONS_STORED, seedInitialNotifications } from "../../domain/notifications/events.ts";
import { useServices } from "../servicesContext.ts";

export function useNotificationCenter(userId: number, onEvents: (events: NotificationItem[]) => void) {
  const { notifications: storage } = useServices();
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => storage.load(userId));

  useEffect(() => { storage.save(notifications, userId); }, [notifications, userId, storage]);

  const receiveSnapshot: SnapshotListener = useCallback((previous, data) => {
    if (previous === null) {
      setNotifications((history) => history.length ? history : seedInitialNotifications(data));
      return;
    }
    const events = incidentNotifications(previous, data);
    if (!events.length) return;
    setNotifications((history) => {
      const ids = new Set(history.map((item) => item.id));
      return [...events.filter((item) => !ids.has(item.id)), ...history].slice(0, MAX_NOTIFICATIONS_STORED);
    });
    onEvents(events);
  }, [onEvents]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
  }, []);
  const markAllAsRead = useCallback(() => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
  }, []);
  const remove = useCallback((id: string) => setNotifications((items) => items.filter((item) => item.id !== id)), []);
  const clear = useCallback(() => setNotifications([]), []);

  return { notifications, receiveSnapshot, markAsRead, markAllAsRead, remove, clear };
}
