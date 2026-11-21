import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as groups from "../src/domain/incidents/groups.ts";
import { remainingSla } from "../src/domain/incidents/sla.ts";
import { formatSla } from "../src/presentation/formatters.ts";
import { normalizeIncident } from "../src/infrastructure/http/incidentMapper.ts";
import { matchesIncidentView, sortIncidentsByUrgency } from "../src/domain/incidents/selectors.ts";

const originals = JSON.parse(await readFile(new URL("../../backend/fixtures/character_problems.json", import.meta.url), "utf8"));

const incident = (extra = {}) => ({
  id: "TEST", priority: "Низкий", service: "Продукт", area: "Компонент",
  summary: "Описание", team: "Другая команда", sla: null, affected: "Среднее",
  ai: "", updated: "", ...extra,
});

test("the original product and service remain separate in the UI projection", () => {
  const raw = { ...incident(), ...originals[0] };
  const view = normalizeIncident(raw);
  assert.equal(view.service, originals[0].productName);
  assert.equal(view.sourceService, originals[0].service);
  assert.equal(view.sysId, "179413934903718013");
  assert.deepEqual(normalizeIncident(view), view);
});

test("an empty authoritative server group list never falls back to critical", () => {
  assert.deepEqual(groups.getIncidentGroups(incident({ groups: [], priority: "Critical" })), []);
});

test("low priority incidents outside coordinator team do not enter any group", () => {
  assert.deepEqual(groups.getIncidentGroups(incident({ priorityId: 1, status: "Assigned" })), []);
  assert.equal(groups.getPrimaryGroup(incident({ groups: [] })), "Прочие");
});

test("Assigned is not a priority or an assignment to the coordinator team", () => {
  assert.deepEqual(groups.getIncidentGroups(incident({ priority: "Assigned", status: "Assigned" })), []);
});

test("a critical active incident can belong to two attention groups", () => {
  assert.deepEqual(groups.getIncidentGroups(incident({ priorityId: 4, status: "Assigned", team: "КЦ ИТ Координаторы Массовых Инцидентов" })), ["Критические", "На координаторах"]);
});

test("each incident has one board column selected by group significance", () => {
  const critical = incident({ status: "Assigned", groups: ["Критические", "На координаторах"] });
  const high = incident({ status: "Assigned", groups: ["На координаторах", "Высокий приоритет"] });
  assert.deepEqual(groups.getIncidentBoardGroups(critical), ["Критические"]);
  assert.deepEqual(groups.getIncidentBoardGroups(high), ["На координаторах"]);
  assert.deepEqual(groups.getIncidentBoardGroups(incident({ status: "Research", groups: ["Исследование ситуации", "На координаторах"] })), ["На координаторах"]);
  assert.deepEqual(groups.getIncidentBoardGroups(incident({ groups: [] })), []);
  assert.deepEqual(groups.getIncidentGroups(critical), ["Критические", "На координаторах"]);
});

test("Research can belong to coordinator group without being active critical", () => {
  const row = incident({ priorityId: 4, status: "Research", team: "КЦ ИТ Координаторы Массовых Инцидентов" });
  assert.deepEqual(groups.getIncidentGroups(row), ["На координаторах", "Исследование ситуации"]);
  assert.equal(groups.isIncidentResolved(row), true);
  assert.equal(groups.isIncidentActive(row), false);
});

test("high priority is separate from resolved and closed statuses", () => {
  assert.deepEqual(groups.getIncidentGroups(incident({ priorityId: 3, status: "WorkInProgress" })), ["Высокий приоритет"]);
  for (const status of ["Resolved", "Closed"]) {
    assert.deepEqual(groups.getIncidentGroups(incident({ priorityId: 4, status })), []);
  }
});

test("overdue and zero SLA are never rendered as SLA met", () => {
  assert.equal(formatSla(-60), "Просрочен на 1м 00с");
  assert.equal(formatSla(0), "Срок истёк");
});

test("missing and unknown deadlines remain explicit", () => {
  assert.equal(formatSla(null), "Срок не задан");
  assert.equal(formatSla(null, "unknown"), "Срок неизвестен");
});

test("completed SLA remains fixed to its actual completion outcome", () => {
  assert.equal(formatSla(60, "met"), "Решён в срок");
  assert.equal(formatSla(-60, "breached"), "Решён с просрочкой");
  assert.equal(remainingSla(incident({ status: "Research", sla: 60 }), 1000), 60);
});

test("an absolute deadline continues counting across refetches and timer resets", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  const row = incident({ deadline: "2026-11-21T00:05:00Z", status: "Assigned", sla: 9999 });
  assert.equal(remainingSla(row, 0, now), 300);
  assert.equal(remainingSla(row, 999, now), 300);
  assert.equal(remainingSla(row, 0, now + 360000), -60);
});

test("missing deadline is never invented as zero seconds", () => {
  assert.equal(remainingSla(incident({ deadline: null, sla: null }), 100), null);
});

test("isResolvedOlderThanDay detects resolved incidents older than 24h", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  // Active incident is never considered an older resolved incident
  assert.equal(
    groups.isResolvedOlderThanDay(
      incident({ status: "Assigned", is_resolved: false, completionDate: "2026-11-19T10:00:00Z" }),
      now
    ),
    false
  );
  // Resolved 2 hours ago (< 24h)
  assert.equal(
    groups.isResolvedOlderThanDay(
      incident({ status: "Resolved", is_resolved: true, completionDate: "2026-11-21T10:00:00Z" }),
      now
    ),
    false
  );
  // Resolved exactly 24 hours ago
  assert.equal(
    groups.isResolvedOlderThanDay(
      incident({ status: "Resolved", is_resolved: true, completionDate: "2026-11-20T12:00:00Z" }),
      now
    ),
    true
  );
  // Resolved 36 hours ago (> 24h)
  assert.equal(
    groups.isResolvedOlderThanDay(
      incident({ status: "Resolved", is_resolved: true, completionDate: "2026-11-20T00:00:00Z" }),
      now
    ),
    true
  );
});

test("research remains visible on the main board and coordinator view", () => {
  const research = incident({ status: "Research", groups: ["На координаторах", "Исследование ситуации"] });
  assert.equal(matchesIncidentView(research, "research"), true);
  assert.equal(matchesIncidentView(research, "all"), true);
  assert.equal(matchesIncidentView(research, "team"), true);
  assert.equal(groups.isResolvedOlderThanDay({ ...research, completionDate: "2020-01-01T00:00:00Z" }), false);
  const coordinator = incident({ status: "Assigned", groups: ["На координаторах"] });
  assert.equal(matchesIncidentView(coordinator, "team"), true);
  assert.equal(matchesIncidentView(coordinator, "all"), true);
  assert.equal(matchesIncidentView(coordinator, "research"), false);
  assert.equal(matchesIncidentView(incident(), "team"), false);
  assert.equal(matchesIncidentView(incident({ groups: ["Исследование ситуации"] }), "research"), true);
});

test("main and team views include research requiring coordinator attention", () => {
  const rows = [
    incident({ status: "Assigned", is_active: true }),
    incident({ status: "WorkInProgress", is_active: true, groups: ["На координаторах"] }),
    incident({ status: "Resolved", is_active: false, is_resolved: true }),
    incident({ status: "Closed", is_resolved: true, groups: ["На координаторах"] }),
    incident({ status: "Research", is_active: false, groups: ["Исследование ситуации", "На координаторах"] }),
    incident({ is_active: false }),
  ];
  assert.equal(rows.filter((row) => matchesIncidentView(row, "all")).length, 3);
  assert.equal(rows.filter((row) => matchesIncidentView(row, "team")).length, 2);
  assert.equal(rows.filter((row) => matchesIncidentView(row, "research")).length, 1);
});

test("expired and imminent deadlines lead, then priority and oldest first, resolved last", () => {
  const rows = [
    incident({ id: "resolved", status: "Resolved", priorityId: 4, sla: -99999 }),
    incident({ id: "critical-new", priorityId: 4, sla: 3600, created: "2026-11-21T00:00:00Z" }),
    incident({ id: "critical-old", priorityId: 4, sla: 7200, created: "2026-11-19T00:00:00Z" }),
    incident({ id: "low", priorityId: 1, sla: 3600, created: "2026-11-18T00:00:00Z" }),
    incident({ id: "imminent", priorityId: 1, sla: 60 }),
    incident({ id: "expired", priorityId: 1, sla: 0 }),
    incident({ id: "overdue", priorityId: 4, sla: -60 }),
    incident({ id: "research", status: "Research", priorityId: 4, sla: -99999 }),
  ];
  const originalOrder = rows.map((row) => row.id);
  assert.deepEqual(sortIncidentsByUrgency(rows, (row) => row.sla).map((row) => row.id), [
    "overdue", "expired", "imminent", "critical-old", "critical-new", "low", "research", "resolved",
  ]);
  assert.deepEqual(rows.map((row) => row.id), originalOrder);
});

test("ordering handles missing dates, missing deadlines and localized priorities deterministically", () => {
  const rows = [
    incident({ id: "B", priority: "Высокий", created: "invalid", sla: NaN }),
    incident({ id: "A", priority: "High", sla: null }),
    incident({ id: "dated", priority: "High", created_at: "2026-11-20T00:00:00Z", created: "invalid" }),
    incident({ id: "critical", priority: "Наивысший" }),
  ];
  assert.deepEqual(sortIncidentsByUrgency(rows, (row) => row.sla).map((row) => row.id), ["critical", "dated", "A", "B"]);
});

test("ordering follows the live deadline when an incident becomes urgent", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const rows = [
    incident({ id: "critical", priorityId: 4, deadline: "2026-11-21T13:00:00Z" }),
    incident({ id: "low", priorityId: 1, deadline: "2026-11-21T12:15:00Z" }),
  ];
  assert.equal(sortIncidentsByUrgency(rows, (row) => remainingSla(row, 0, now))[0].id, "critical");
  assert.equal(sortIncidentsByUrgency(rows, (row) => remainingSla(row, 0, now + 1000))[0].id, "low");
});
