import type { AuthUser } from "../domain/auth.ts";
import type { Incident } from "../domain/incidents/types.ts";
import type { DashboardSummary, IncidentSummary, SummaryMode, SummaryWindow } from "../domain/analysis.ts";
import type { NotificationItem } from "../domain/notifications/types.ts";

export type Dispose = () => void;
export type Credentials = { login: string; password: string };

export interface SessionGateway {
  current(): Promise<AuthUser>;
  login(credentials: Credentials): Promise<AuthUser>;
  logout(): Promise<void>;
  onExpired(listener: (message?: string) => void): Dispose;
}

export interface IncidentStreamObserver {
  opened(): void;
  snapshot(incidents: Incident[]): void;
  disconnected(): void;
  invalidMessage(): void;
}

export interface IncidentGateway {
  list(): Promise<Incident[]>;
  resolve(id: string): Promise<Incident>;
  assign(id: string, team: string, assignee?: string): Promise<Incident>;
  subscribe(observer: IncidentStreamObserver): Dispose;
}

export interface AnalysisGateway {
  dashboard(signal?: AbortSignal, mode?: SummaryMode, windowMinutes?: SummaryWindow): Promise<DashboardSummary>;
  incident(id: string, signal?: AbortSignal): Promise<IncidentSummary>;
}

export interface NotificationStorage {
  load(userId: number): NotificationItem[];
  save(items: NotificationItem[], userId: number): void;
}

export interface AppServices {
  session: SessionGateway;
  incidents: IncidentGateway;
  analysis: AnalysisGateway;
  notifications: NotificationStorage;
  sound: { play(type: "critical" | "assigned" | "resolved"): void };
  lifecycle: { onVisible(listener: () => void): Dispose };
}
