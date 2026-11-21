import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL("../", import.meta.url)),
  plugins: [react()], server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] } });
const load = (name) => vite.ssrLoadModule(`/src/${name}`);
const { ServicesContext } = await load("application/servicesContext.ts");
const { useIncidents } = await load("application/incidents/useIncidents.ts");
const { useSession } = await load("application/auth/useSession.ts");
const { useDashboardSummary } = await load("application/analysis/useDashboardSummary.ts");
const { AiOverview } = await load("presentation/components/dashboard/AiOverview.tsx");
const { DashboardPage } = await load("presentation/pages/DashboardPage.tsx");
after(async () => { await vite.close(); dom.window.close(); });

const now = Date.parse("2026-11-22T10:00:00Z");
const user = { id: 1, login: "first", full_name: "Первый Координатор", role: "coordinator" };
const row = (id, minutes, priorityId = 4) => ({ id, updated: "v1", status: "Assigned", is_active: true, is_resolved: false,
  priorityId, impactId: 2, priority: "Высокий", groups: ["Критические"], deadline: new Date(now + minutes * 60000).toISOString(),
  created: new Date(now - 3600000).toISOString(), service: id, productName: id, team: "Команда", summary: `Проблема ${id}`,
  area: "", sla: minutes * 60, affected: "Высокое", ai: "" });
const summary = (rows, mode = "upcoming", window_minutes = 30) => ({ mode, window_minutes, status: "ready", summary: "Обзор",
  total_candidates: rows.length, analyzed_count: rows.length, limitations: [], generated_at: null, statistics: {}, as_of: new Date(now).toISOString(),
  highlights: rows.map((incident) => ({ incident, reason: mode === "overdue" ? "overdue" : "deadline_soon", analyzed: true, summary: `Анализ ${incident.id}` })) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const defaults = (overrides = {}) => ({ incidents: { list: async () => [], subscribe: () => () => {} }, lifecycle: { onVisible: () => () => {} },
  notifications: { load: () => [], save() {} }, sound: { play() {} },
  analysis: { dashboard: async (_signal, mode, minutes) => summary([], mode, minutes) }, ...overrides });
async function render(t, component, services) {
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const update = async (element) => { await act(async () => root.render(createElement(ServicesContext.Provider, { value: services }, element))); };
  await update(component); let mounted = true;
  const unmount = async () => { if (!mounted) return; mounted = false; await act(async () => root.unmount()); container.remove(); };
  t.after(unmount); return { container, update, unmount };
}
async function hook(t, callback, services, initial = []) {
  let value; function Probe({ args }) { value = callback(...args); return null; }
  const view = await render(t, createElement(Probe, { args: initial }), services);
  return { ...view, get value() { return value; }, rerender: (args) => view.update(createElement(Probe, { args })) };
}
const tick = async (t, milliseconds) => { await act(async () => { t.mock.timers.tick(milliseconds); }); };

test("failed HTTP snapshots retry with connected SSE and recover without a new event", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let observer, attempts = 0, disconnected = false; const signals = [], statuses = [];
  const services = defaults({ incidents: {
    list: async (signal) => { signals.push(signal); if (++attempts < 3) throw Error("Temporary failure"); return [row("recovered", -1)]; },
    subscribe: (value) => { observer = value; return () => { disconnected = true; }; } } });
  const view = await hook(t, useIncidents, services, [() => {}, (status) => statuses.push(status)]);
  await act(async () => observer.opened()); assert.equal(attempts, 2); assert.equal(view.value.incidents.length, 0);
  await tick(t, 2000); assert.equal(attempts, 3); assert.equal(view.value.incidents[0].id, "recovered"); assert.equal(statuses.at(-1), "connected");
  await view.unmount(); assert.equal(disconnected, true); assert.equal(signals.at(-1).aborted, true);
  await tick(t, 60000); assert.equal(attempts, 3);
});

test("fresh SSE snapshots cancel scheduled HTTP retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] }); let observer, attempts = 0;
  const services = defaults({ incidents: { list: async () => { attempts++; throw Error("Temporary failure"); },
    subscribe: (value) => { observer = value; return () => {}; } } });
  const view = await hook(t, useIncidents, services, [() => {}, () => {}]);
  await act(async () => observer.snapshot([row("fresh", -1)])); await tick(t, 30000);
  assert.equal(attempts, 1); assert.equal(view.value.incidents[0].id, "fresh");
});

test("successful session checks replace an account changed in another tab", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] }); let current = user, visible;
  const services = defaults({ session: { current: async () => current, onExpired: () => () => {} },
    lifecycle: { onVisible: (callback) => { visible = callback; return () => {}; } } });
  const view = await hook(t, useSession, services); assert.equal(view.value.user.id, 1);
  current = { ...user, id: 2, login: "second", full_name: "Второй Координатор" };
  await act(async () => visible()); assert.equal(view.value.user.id, 2); assert.equal(view.value.user.full_name, current.full_name);
});

test("older session checks cannot replace a newer account", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] }); let visible, current = () => Promise.resolve(user);
  const services = defaults({ session: { current: () => current(), onExpired: () => () => {} },
    lifecycle: { onVisible: (callback) => { visible = callback; return () => {}; } } });
  const view = await hook(t, useSession, services); const old = deferred(); current = () => old.promise;
  await act(async () => visible()); current = () => Promise.resolve({ ...user, id: 2 });
  await act(async () => visible()); await act(async () => old.resolve(user)); assert.equal(view.value.user.id, 2);
});

test("live revisions do not postpone AI polling and automatic refresh is two minutes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] }); let rows = [row("live", 10)], calls = 0;
  const first = deferred(), signals = [];
  const services = defaults({ analysis: { dashboard: async (signal) => { signals.push(signal); calls++; return calls === 1 ? first.promise : summary(rows); } } });
  const view = await hook(t, useDashboardSummary, services, [rows, now]); await tick(t, 800);
  rows = [{ ...rows[0], updated: "v2" }]; await view.rerender([rows, now]); await tick(t, 200); assert.equal(calls, 1);
  for (let i = 0; i < 6; i++) { await tick(t, 800); rows = [{ ...rows[0], updated: `v${i + 3}` }]; await view.rerender([rows, now]); }
  assert.equal(calls, 1); assert.equal(signals[0].aborted, false);
  await act(async () => first.resolve(summary([row("live", 10)]))); assert.equal(view.value.highlights[0].analyzed, false);
  await tick(t, 114200); assert.equal(calls, 2);
  await act(async () => view.value.refresh()); await tick(t, 1000); assert.equal(calls, 3);
});

test("assistant filters preserve explanations without requesting AI", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const rows = [row("short", -30, 4), row("middle", -120, 4), row("long", -480, 3), row("old", -1800, 1)]; let calls = 0;
  const services = defaults({ analysis: { dashboard: async () => { calls++; return summary(rows, "overdue"); } } });
  const view = await render(t, createElement(AiOverview, { incidents: rows, now, mode: "overdue", onSelectIncident() {} }), services);
  await tick(t, 1000); assert.equal(calls, 1); assert.equal(view.container.querySelectorAll(".ai-focus-card").length, 4);
  async function select(label, value) { const control = view.container.querySelector(`select[aria-label="${label}"]`);
    await act(async () => { control.value = value; control.dispatchEvent(new window.Event("change", { bubbles: true })); }); }
  await select("Длительность просрочки", "one_to_six"); assert.equal(view.container.querySelectorAll(".ai-focus-card").length, 1);
  assert.match(view.container.querySelector(".ai-focus-card").textContent, /Анализ middle/);
  await select("Приоритет инцидента", "3"); assert.equal(view.container.querySelectorAll(".ai-focus-card").length, 0);
  assert.match(view.container.textContent, /Нет инцидентов по выбранным фильтрам/);
  await select("Длительность просрочки", "all"); assert.match(view.container.querySelector(".ai-focus-card").textContent, /Анализ long/);
  await select("Приоритет инцидента", "all"); assert.equal(view.container.querySelectorAll(".ai-focus-card").length, 4); assert.equal(calls, 1);
});

test("assistant badge tracks deadline crossings and live resolutions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now });
  const rows = [row("expired", -10), row("future", 1 / 60), { ...row("research", -20), status: "Research", is_active: false, is_resolved: true, groups: ["Исследование ситуации"] }]; let observer;
  const services = defaults({ incidents: { list: async () => rows, subscribe: (value) => { observer = value; return () => {}; } } });
  const view = await render(t, createElement(DashboardPage, { user, onLogout() {}, signingOut: false }), services);
  const badge = () => view.container.querySelector('nav button[aria-label^="Ассистент"] b')?.textContent;
  assert.equal(badge(), "1"); assert.doesNotMatch(view.container.querySelector(".page-heading").textContent, /Россия|Оперативный центр/);
  await tick(t, 1000); assert.equal(badge(), "2");
  await act(async () => observer.snapshot([{ ...rows[0], status: "Resolved", is_active: false, is_resolved: true, groups: [] }, ...rows.slice(1)])); assert.equal(badge(), "1");
});
