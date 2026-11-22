import type { AuthUser } from "../domain/auth.ts";
import type { Incident } from "../domain/incidents/types.ts";
import type { DashboardSummary, IncidentSummary, SummaryMode, SummaryWindow } from "../domain/analysis.ts";
import type { NotificationItem } from "../domain/notifications/types.ts";
import type { TeamCandidate, TeamRecommendation } from "../domain/teams/types.ts";

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
  list(signal?: AbortSignal): Promise<Incident[]>;
  resolve(id: string): Promise<Incident>;
  close(id: string, updated: string): Promise<Incident>;
  undoResolve(id: string, updated: string): Promise<Incident>;
  assign(id: string, team: string, assignee?: string, selectedWithAi?: boolean): Promise<Incident>;
  subscribe(observer: IncidentStreamObserver): Dispose;
}

export interface AnalysisGateway {
  dashboard(signal?: AbortSignal, mode?: SummaryMode, windowMinutes?: SummaryWindow): Promise<DashboardSummary>;
  incident(id: string, signal?: AbortSignal): Promise<IncidentSummary>;
  recommendForTeam(team: TeamCandidate, signal?: AbortSignal, incidentIds?: string[]): Promise<TeamRecommendation[]>;
  recommendTeam(id: string, teams: TeamCandidate[], signal?: AbortSignal): Promise<TeamRecommendation>;
}

export interface NotificationStorage {
  load(userId: number): NotificationItem[];
  save(items: NotificationItem[], userId: number): void;
}

export interface PwaState {
  online: boolean;
  installAvailable: boolean;
  iosInstallHint: boolean;
  installed: boolean;
  updateAvailable: boolean;
  updating: boolean;
  error: string;
}

export interface PwaGateway {
  getSnapshot(): PwaState;
  subscribe(listener: () => void): Dispose;
  install(): Promise<void>;
  update(): Promise<void>;
}

export type DesktopNotificationPermission = "default" | "granted" | "denied" | "unsupported";

export interface DesktopNotificationGateway {
  isSupported(): boolean;
  getPermission(): DesktopNotificationPermission;
  requestPermission(): Promise<DesktopNotificationPermission>;
  notify(title: string, options?: { body?: string; tag?: string; onClick?: () => void }): void;
}

export interface AppServices {
  pwa?: PwaGateway;
  desktopNotifications?: DesktopNotificationGateway;
  session: SessionGateway;
  incidents: IncidentGateway;
  analysis: AnalysisGateway;
  notifications: NotificationStorage;
  sound: { play(type: "critical" | "assigned" | "resolved" | "focus"): void };
  lifecycle: { onVisible(listener: () => void): Dispose };
}
