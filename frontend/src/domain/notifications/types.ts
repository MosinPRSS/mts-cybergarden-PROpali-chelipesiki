export type NotificationType = "critical" | "assigned" | "resolved" | "info";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  incidentId?: string;
  service?: string;
}
