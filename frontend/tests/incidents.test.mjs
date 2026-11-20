import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as groups from "../src/lib/groups.ts";
import { formatSla, remainingSla } from "../src/lib/formatters.ts";
import { normalizeIncident } from "../src/lib/incidents.ts";
const originals = JSON.parse(await readFile(new URL("../../backend-rework/fixtures/character_problems.json", import.meta.url), "utf8"));

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
