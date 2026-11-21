// Compatibility exports for existing consumers. New modules import their owning layer.
export type { AuthUser } from "../domain/auth.ts";
export type { Incident, IncidentView } from "../domain/incidents/types.ts";
export type { DashboardSummary, IncidentSummary } from "../domain/analysis.ts";
export type { NotificationType, NotificationItem } from "../domain/notifications/types.ts";
export type { TeamMember, TeamDutyStatus, Team } from "../domain/teams/types.ts";
export type { IconName, Column, AlertBannerState, LiveStatusState, NavItemConfig } from "../presentation/models.ts";
