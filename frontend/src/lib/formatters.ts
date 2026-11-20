import type { Incident } from "../types";

export function formatSla(value: number | null, state?: Incident["sla_state"]): string {
  if (state === "met") return "Решён в срок";
  if (state === "breached") return "Решён с просрочкой";
  if (state === "unknown") return "Срок неизвестен";
  if (value === null || state === "no_deadline") return "Срок не задан";
  if (value === 0) return "Срок истёк";
  const duration = Math.abs(Math.ceil(value));
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  const formatted = hours
    ? `${hours}ч ${String(minutes).padStart(2, "0")}м`
    : `${minutes}м ${String(seconds).padStart(2, "0")}с`;
  return value < 0 ? `Просрочен на ${formatted}` : formatted;
}

export function remainingSla(incident: Incident, secondsPassed = 0, now = Date.now()): number | null {
  if (incident.is_resolved || ["Resolved", "Closed", "Research"].includes(incident.status || "")) return incident.sla;
  if (incident.deadline) return Math.ceil((Date.parse(incident.deadline) - now) / 1000);
  return incident.sla === null ? null : incident.sla - secondsPassed;
}
