import type { Incident, IncidentView } from "../../domain/incidents/types.ts";
import type { Column } from "../models.ts";
import { getIncidentGroups, SIGNIFICANCE_ORDER } from "../../domain/incidents/groups.ts";

export function getBoardColumns(incidents: Incident[], view: IncidentView): Column[] {
  const customGroups = Array.from(new Set(incidents.flatMap(getIncidentGroups)
    .filter((group) => !SIGNIFICANCE_ORDER.includes(group))));
  const base: Column[] = [
    {
      key: "Критические",
      id: "critical",
      title: "Критические",
      hint: "Наивысший приоритет · Контроль восстановления",
      badgeClass: "critical",
      priorityRank: 1,
    },
    {
      key: "На координаторах",
      id: "coordinators",
      title: "На координаторах",
      hint: "2-й приоритет · Маршрутизация в команды",
      badgeClass: "assigned",
      priorityRank: 2,
    },
    {
      key: "Высокий приоритет",
      id: "high",
      title: "Высокий приоритет",
      hint: "3-й приоритет · Под наблюдением",
      badgeClass: "high",
      priorityRank: 3,
    },
    {
      key: "Исследование ситуации",
      id: "resolved",
      title: "Исследование ситуации",
      hint: "Разбор причин",
      badgeClass: "resolved",
      priorityRank: 4,
    },
  ];

  const custom: Column[] = customGroups.map((groupName, idx) => ({
    key: groupName,
    id: `custom-${idx}`,
    title: groupName,
    hint: "Дополнительная группа инцидентов",
    badgeClass: "custom",
    priorityRank: 5 + idx,
    isCustom: true,
  }));

  if (view === "research") return base.filter((column) => column.key === "Исследование ситуации");
  return [...base.filter((column) => column.key !== "Исследование ситуации"), ...custom];
}
