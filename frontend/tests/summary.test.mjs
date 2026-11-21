import assert from "node:assert/strict";
import test from "node:test";
import { summaryCandidates, matchesOverdueFilters } from "../src/domain/incidents/summary.ts";
import { fetchDashboardSummary } from "../src/infrastructure/http/incidentApi.ts";

const now = Date.parse("2026-11-21T12:00:00Z");
const row = (id, minutes, extra = {}) => ({ id, status: "Assigned", priorityId: 2, impactId: 2,
  deadline: minutes === null ? null : new Date(now + minutes * 60000).toISOString(), ...extra });

test("overdue-age filters partition exact hour, six-hour and day boundaries", () => {
  const rows = [row("now", 0), row("short", -59), row("hour", -60), row("six", -360), row("day", -1440),
    row("future", 1), row("unknown", null), row("invalid", 1, { deadline: "invalid" })];
  const selected = (age) => rows.filter((item) => matchesOverdueFilters(item, now, "all", age)).map((item) => item.id);
  assert.deepEqual(selected("under_hour"), ["now", "short"]);
  assert.deepEqual(selected("one_to_six"), ["hour"]);
  assert.deepEqual(selected("six_to_day"), ["six"]);
  assert.deepEqual(selected("day_or_more"), ["day"]);
  assert.deepEqual(selected("all"), ["now", "short", "hour", "six", "day"]);
  assert.equal(matchesOverdueFilters(rows[0], now, "4", "all"), false);
  assert.equal(matchesOverdueFilters({ ...rows[0], priorityId: 4 }, now, "4", "all"), true);
});

test("upcoming and overdue summaries partition deadline boundaries and exclude completed states", () => {
  const rows = [row("expired", -1), row("now", 0), row("soon", 1), row("boundary", 30),
    row("later", 31), row("unknown", null), row("invalid", 10, { deadline: "invalid" }),
    ...["Research", "Resolved", "Closed"].flatMap((status) => [row(`${status}-soon`, 1, { status }), row(`${status}-past`, -1, { status })])];
  assert.deepEqual(summaryCandidates(rows, "upcoming", now).map((item) => item.id), ["soon", "boundary"]);
  assert.deepEqual(summaryCandidates(rows, "overdue", now).map((item) => item.id), ["expired", "now"]);
  assert.deepEqual(summaryCandidates([rows[2]], "upcoming", now + 60000), []);
  assert.deepEqual(summaryCandidates([rows[2]], "overdue", now + 60000).map((item) => item.id), ["soon"]);
});

test("all overdue records are retained, sorted by impact then overdue duration", () => {
  const rows = Array.from({ length: 42 }, (_, i) => row(`past-${i}`, -i - 1));
  const result = summaryCandidates(rows, "overdue", now);
  assert.equal(result.length, 42);
  assert.equal(result[0].id, "past-41");
  assert.equal(result.at(-1).id, "past-0");
  assert.equal(rows[0].id, "past-0");
  assert.deepEqual(summaryCandidates([row("critical", 5, { priorityId: 4 }), row("low", 1, { priorityId: 1 })], "upcoming", now)
    .map((item) => item.id), ["low", "critical"]);
});

test("overdue impact leads even when another incident has been overdue longer or has higher priority", () => {
  const rows = [row("old-low-impact", -200, { impactId: 1, priorityId: 4 }),
    row("recent-high-impact", -1, { impactId: 4, priorityId: 4 }),
    row("older-high-impact", -10, { impactId: 4, priorityId: 1 })];
  assert.deepEqual(summaryCandidates(rows, "overdue", now).map((item) => item.id),
    ["older-high-impact", "recent-high-impact", "old-low-impact"]);
});

test("upcoming filters out far critical deadlines, then uses impact and remaining time", () => {
  const rows = [row("far-critical", 5000, { priorityId: 4, impactId: 4 }),
    row("medium-soon", 5, { priorityId: 2, impactId: 2 }),
    row("high-impact-later", 25, { priorityId: 1, impactId: 4 }),
    row("high-impact-sooner", 15, { priorityId: 4, impactId: 4 })];
  assert.deepEqual(summaryCandidates(rows, "upcoming", now).map((item) => item.id),
    ["high-impact-sooner", "high-impact-later", "medium-soon"]);
});

test("each selected window includes its boundary and excludes expired, later and resolved records", () => {
  for (const minutes of [30, 60, 120, 360, 720, 1440]) {
    const rows = [row("boundary", minutes), row("later", minutes + 1), row("expired", 0),
      row("soon", 5, { impactId: 1 }), row("resolved", 5, { status: "Resolved" })];
    assert.deepEqual(summaryCandidates(rows, "upcoming", now, minutes).map((item) => item.id), ["boundary", "soon"]);
    assert.deepEqual(summaryCandidates(rows, "overdue", now, minutes).map((item) => item.id), ["expired"]);
  }
});

test("both modes use the same HTTP adapter and keep every returned explanation", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    const mode = new URL(url, "http://localhost").searchParams.get("mode");
    return new Response(JSON.stringify({ mode, status: "ready", highlights: Array.from({ length: mode === "overdue" ? 12 : 3 }, (_, i) => ({
      incident: { id: String(i), productName: "Продукт", service: "Сервис" }, summary: "Проверьте статус", analyzed: true,
    })) }), { status: 200 });
  };
  const upcoming = await fetchDashboardSummary();
  const overdue = await fetchDashboardSummary(undefined, "overdue");
  await fetchDashboardSummary(undefined, "upcoming", 1440);
  assert.deepEqual(requests, ["/api/incidents/summary?mode=upcoming&window_minutes=30", "/api/incidents/summary?mode=overdue",
    "/api/incidents/summary?mode=upcoming&window_minutes=1440"]);
  assert.equal(upcoming.highlights.length, 3);
  assert.equal(overdue.highlights.length, 12);
  assert.equal(overdue.highlights[0].incident.service, "Продукт");
});
