import assert from "node:assert/strict";
import test from "node:test";
import { summaryCandidates } from "../src/domain/incidents/summary.ts";
import { fetchDashboardSummary } from "../src/infrastructure/http/incidentApi.ts";

const now = Date.parse("2026-11-21T12:00:00Z");
const row = (id, minutes, extra = {}) => ({ id, status: "Assigned", priorityId: 2, impactId: 2,
  deadline: minutes === null ? null : new Date(now + minutes * 60000).toISOString(), ...extra });

test("upcoming and overdue summaries partition deadline boundaries and exclude completed states", () => {
  const rows = [row("expired", -1), row("now", 0), row("soon", 1), row("boundary", 30),
    row("later", 31), row("unknown", null), row("invalid", 10, { deadline: "invalid" }),
    ...["Research", "Resolved", "Closed"].flatMap((status) => [row(`${status}-soon`, 1, { status }), row(`${status}-past`, -1, { status })])];
  assert.deepEqual(summaryCandidates(rows, "upcoming", now).map((item) => item.id), ["soon", "boundary"]);
  assert.deepEqual(summaryCandidates(rows, "overdue", now).map((item) => item.id), ["expired", "now"]);
  assert.deepEqual(summaryCandidates([rows[2]], "upcoming", now + 60000), []);
  assert.deepEqual(summaryCandidates([rows[2]], "overdue", now + 60000).map((item) => item.id), ["soon"]);
});

test("all overdue records are retained, sorted by deadline then priority and impact", () => {
  const rows = Array.from({ length: 42 }, (_, i) => row(`past-${i}`, -i - 1));
  const result = summaryCandidates(rows, "overdue", now);
  assert.equal(result.length, 42);
  assert.equal(result[0].id, "past-41");
  assert.equal(result.at(-1).id, "past-0");
  assert.equal(rows[0].id, "past-0");
  assert.deepEqual(summaryCandidates([row("critical", 5, { priorityId: 4 }), row("low", 1, { priorityId: 1 })], "upcoming", now)
    .map((item) => item.id), ["low", "critical"]);
});

test("both modes use the same HTTP adapter and keep every returned explanation", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    const mode = url.endsWith("overdue") ? "overdue" : "upcoming";
    return new Response(JSON.stringify({ mode, status: "ready", highlights: Array.from({ length: mode === "overdue" ? 12 : 3 }, (_, i) => ({
      incident: { id: String(i), productName: "Продукт", service: "Сервис" }, summary: "Проверьте статус", analyzed: true,
    })) }), { status: 200 });
  };
  const upcoming = await fetchDashboardSummary();
  const overdue = await fetchDashboardSummary(undefined, "overdue");
  assert.deepEqual(requests, ["/api/incidents/summary?mode=upcoming", "/api/incidents/summary?mode=overdue"]);
  assert.equal(upcoming.highlights.length, 3);
  assert.equal(overdue.highlights.length, 12);
  assert.equal(overdue.highlights[0].incident.service, "Продукт");
});
