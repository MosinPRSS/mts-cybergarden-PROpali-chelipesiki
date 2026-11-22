import type { DesktopNotificationGateway, DesktopNotificationPermission } from "../../application/ports.ts";

export function createDesktopNotifications(): DesktopNotificationGateway {
  const isSupported = () => typeof window !== "undefined" && "Notification" in window;

  const getPermission = (): DesktopNotificationPermission => {
    if (!isSupported()) return "unsupported";
    return window.Notification.permission as DesktopNotificationPermission;
  };

  return {
    isSupported,
    getPermission,
    async requestPermission(): Promise<DesktopNotificationPermission> {
      if (!isSupported()) return "unsupported";
      try {
        const result = await window.Notification.requestPermission();
        return result as DesktopNotificationPermission;
      } catch {
        return "denied";
      }
    },
    notify(title: string, options?: { body?: string; tag?: string; onClick?: () => void }) {
      if (!isSupported() || getPermission() !== "granted") return;

      const body = options?.body;
      const tag = options?.tag;
      const icon = "./pwa-192.png";

      const tryDirectNotification = () => {
        try {
          const notification = new window.Notification(title, {
            body,
            icon,
            tag,
          });
          if (options?.onClick) {
            notification.onclick = () => {
              window.focus();
              options.onClick?.();
            };
          }
        } catch {
          // On mobile Android, `new Notification()` can throw without ServiceWorker.
        }
      };

      if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then((registration) => {
            return registration.showNotification(title, {
              body,
              icon,
              badge: icon,
              tag,
            });
          })
          .catch(() => {
            tryDirectNotification();
          });
      } else {
        tryDirectNotification();
      }
    },
  };
}
