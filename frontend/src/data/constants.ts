import { IconName } from "../types";

export const SIGNIFICANCE_ORDER = [
  "Критические",
  "На координаторах",
  "Высокий риск",
  "Исследование ситуации",
];

export const PRESET_GROUPS = [
  "ИТ-Инфраструктура",
  "Безопасность",
  "Биллинг",
  "Сеть",
  "На координаторах",
  "Мониторинг",
];

export const NAVIGATION_ITEMS: Array<{ key: string; icon: IconName; label: string }> = [
  { key: "board", icon: "grid", label: "Инциденты" },
  { key: "analytics", icon: "chart", label: "Аналитика" },
  { key: "teams", icon: "users", label: "Команды" },
  { key: "history", icon: "history", label: "История" },
];
