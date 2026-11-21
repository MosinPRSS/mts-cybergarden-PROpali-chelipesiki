import type { Incident } from "../domain/incidents/types.ts";

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


export function getGroupBadgeClass(groupName: string): string {
  switch (groupName) {
    case "Критические":
      return "critical";
    case "На координаторах":
      return "assigned";
    case "Высокий приоритет":
      return "high";
    case "Исследование ситуации":
      return "resolved";
    default:
      return "custom";
  }
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

