import assert from "node:assert/strict";
import test from "node:test";
import { getBoardColumns } from "../src/presentation/dashboard/columns.ts";
import { filterBoardIncidents, filterIncidentHistory, getDashboardMetrics } from "../src/presentation/dashboard/selectors.ts";
import { getIncidentBoardGroups, getPrimaryGroup } from "../src/domain/incidents/groups.ts";
import { NAVIGATION_ITEMS } from "../src/data/constants.ts";

const row = (id, extra = {}) => ({
  id, priority: "Средний", service: "Продукт", area: "Компонент", summary: "Описание",
  team: "Команда", sla: null, affected: "Среднее", ai: "", updated: "", ...extra,
});

test("main board has three columns with unique cards; research remains a separate view", () => {
  const rows = [row("critical", { status: "Assigned", groups: ["Критические", "На координаторах"] }),
    row("research", { status: "Research", groups: ["На координаторах", "Исследование ситуации"] }),
    row("resolved", { status: "Resolved", groups: [] })];
  assert.deepEqual(getBoardColumns(rows, "all").map((column) => column.key),
    ["Критические", "На координаторах", "Высокий приоритет"]);
  assert.deepEqual(getBoardColumns(rows, "research").map((column) => column.key), ["Исследование ситуации"]);
  assert.deepEqual(filterBoardIncidents(rows, "", "team").map((item) => item.id), ["critical", "research"]);
  assert.deepEqual(filterBoardIncidents(rows, "исследование", "all").map((item) => item.id), ["research", "resolved"]);
  assert.deepEqual(filterIncidentHistory(rows, "RESOLVED").map((item) => item.id), []);
  const columns = getBoardColumns(rows, "all");
  const visible = columns.flatMap((column) => rows.filter((item) => getIncidentBoardGroups(item).includes(column.key)));
  assert.deepEqual(visible.map((item) => item.id), ["critical"]);
  assert.equal(new Set(visible.map((item) => item.id)).size, visible.length);
  assert.equal(getPrimaryGroup(rows[1]), "На координаторах");
  assert.equal(NAVIGATION_ITEMS.some((item) => item.key === "analytics" && item.label === "Ассистент"), true);
});

test("research-only incidents do not inflate the main board count", () => {
  const research = row("research-only", { status: "Research", groups: ["Исследование ситуации"] });
  const metrics = getDashboardMetrics([research], (item) => item.sla);
  assert.equal(metrics.totalCount, 0);
  assert.equal(metrics.researchCount, 1);
  assert.equal(metrics.myTeamCount, 0);
});

test("metrics count unique incidents while preserving SLA and overlapping group counts", () => {
  const rows = [row("critical", { status: "Assigned", groups: ["Критические", "На координаторах"], sla: -1 }),
    row("research", { status: "Research", groups: ["Исследование ситуации", "На координаторах"], sla: 60, sla_state: "met" }),
    row("other", { status: "Assigned", groups: [] }),
    row("resolved", { status: "Resolved", sla: -60, sla_state: "breached" })];
  const before = structuredClone(rows);
  assert.deepEqual(getDashboardMetrics(rows, (item) => item.sla), {
    criticalCount: 1, riskCount: 1, nearestRiskSla: "Просрочен на 0м 01с", workloadCount: 2,
    resolvedMetCount: 1, resolvedWithDeadlineCount: 2, totalCount: 1, researchCount: 2, myTeamCount: 2,
  });
  assert.deepEqual(rows, before);
});

test("hide overdue preserves resolved, no-deadline and future incidents, and composes with search", () => {
  const rows = [
    row("overdue", { status: "Assigned", sla: -10 }),
    row("expired", { status: "Assigned", sla: 0 }),
    row("future", { status: "Assigned", sla: 20 }),
    row("unknown", { status: "Assigned", sla: null }),
    row("invalid", { status: "Assigned", sla: NaN }),
    row("resolved", { status: "Resolved", sla: -10, sla_state: "breached" }),
  ];
  assert.deepEqual(filterBoardIncidents(rows, "", "all", { hideOverdue: true }).map((item) => item.id),
    ["future", "unknown", "invalid", "resolved"]);
  assert.equal(filterBoardIncidents(rows, "", "all").length, rows.length);
  assert.deepEqual(filterBoardIncidents(rows, "future", "all", { hideOverdue: true }).map((item) => item.id), ["future"]);
  assert.deepEqual(filterBoardIncidents(rows, "", "research", { hideOverdue: true }).map((item) => item.id), ["resolved"]);
});

test("hide overdue follows the live SLA callback as deadlines expire", () => {
  const rows = [row("live", { status: "Assigned", sla: 100 })];
  assert.equal(filterBoardIncidents(rows, "", "all", { hideOverdue: true, slaFor: () => 1 }).length, 1);
  assert.equal(filterBoardIncidents(rows, "", "all", { hideOverdue: true, slaFor: () => 0 }).length, 0);
});
