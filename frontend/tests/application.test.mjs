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
const { Drawer } = await load("presentation/components/dashboard/Drawer.tsx");
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

test("the drawer requests LLM routing on demand and assigns its team rather than the CDN heuristic", async (t) => {
  const incident = { ...row("CDN-INC", -1), updated: new Date(now).toISOString(),
    team: "КЦ ИТ Координаторы Массовых Инцидентов", description: "Проблема с CDN" };
  let calls = 0;
  const assigned = [];
  const services = defaults({ analysis: { recommendTeam: async (id, teams, signal) => {
    calls++;
    assert.equal(id, incident.id);
    assert.equal(teams.length, 9);
    assert.ok(teams.some((team) => team.id === "digital-platform"));
    assert.ok(!teams.some((team) => team.id === "coordinators"));
    assert.ok(teams.every((team) => !Object.hasOwn(team, "lead")));
    assert.equal(signal.aborted, false);
    const chosen = teams.find((team) => team.id === "infra");
    return { incident_id: id, team: { id: chosen.id, name: chosen.name }, match_percent: 86,
      reason: "Команда сопровождает инфраструктуру доставки контента.",
      criteria: { product_service: 90, technical_skills: 85, responsibility: 80 },
      generated_at: new Date(now).toISOString(), incident_updated_at: incident.updated };
  } } });
  const view = await render(t, createElement(Drawer, { incident, seconds: -60, onClose() {},
    onAssignTeam: (...args) => assigned.push(args) }), services);
  const panel = () => view.container.querySelector('[aria-label="ИИ-подбор команды"]');
  assert.equal(calls, 0);
  await act(async () => panel().querySelector("button").click());
  assert.equal(calls, 1);
  assert.match(panel().textContent, /ИТ-Инфраструктура/);
  assert.match(panel().textContent, /86%/);
  assert.doesNotMatch(panel().textContent, /Упоминание компонента|Digital Platform/);
  assert.equal(panel().querySelector("details").open, false);
  await act(async () => panel().querySelector(".ai-rec-assign-btn").click());
  assert.deepEqual(assigned, [[incident.id, "ИТ-Инфраструктура", true]]);
  const saved = { ...incident, team: "ИТ-Инфраструктура", team_selected_with_ai: true,
    updated: new Date(now + 1000).toISOString() };
  await view.update(createElement(Drawer, { incident: saved, seconds: -60, onClose() {}, onAssignTeam() {} }));
  assert.match(panel().textContent, /Выбрано с помощью ИИ/);
  assert.match(panel().textContent, /ИТ-Инфраструктура/);
  assert.equal(panel().querySelector("button"), null);
  await view.unmount();
  const reopened = await render(t, createElement(Drawer, { incident: saved, seconds: -60, onClose() {}, onAssignTeam() {} }), services);
  assert.match(reopened.container.textContent, /Выбрано с помощью ИИ/);
  assert.equal(reopened.container.querySelector('[aria-label="ИИ-подбор команды"] button'), null);
  assert.equal(calls, 1);
});

test("an AI suggestion for the current team still requires explicit confirmation", async (t) => {
  const incident = { ...row("SAME-TEAM", -1), updated: new Date(now).toISOString(), team: "Digital Platform" };
  const assigned = [];
  const services = defaults({ analysis: { recommendTeam: async () => ({ incident_id: incident.id,
    incident_updated_at: incident.updated, team: { id: "digital-platform", name: incident.team }, match_percent: 80,
    reason: "Команда сопровождает этот сервис.", criteria: { product_service: 80, technical_skills: 80, responsibility: 80 } }) } });
  const view = await render(t, createElement(Drawer, { incident, seconds: -60, onClose() {},
    onAssignTeam: (...args) => assigned.push(args) }), services);
  const panel = view.container.querySelector('[aria-label="ИИ-подбор команды"]');
  await act(async () => panel.querySelector("button").click());
  const confirm = panel.querySelector(".ai-rec-assign-btn");
  assert.equal(confirm.textContent, "Подтвердить выбор ИИ");
  assert.equal(assigned.length, 0);
  await act(async () => confirm.click());
  assert.deepEqual(assigned, [[incident.id, incident.team, true]]);
  assert.doesNotMatch(panel.textContent, /Выбрано с помощью ИИ/);
});

test("an AI routing failure offers retry without enabling a heuristic assignment", async (t) => {
  const incident = { ...row("CDN-ERROR", -1), updated: new Date(now).toISOString(), description: "Сбой CDN" };
  const services = defaults({ analysis: { recommendTeam: async () => { throw Error("ИИ-подбор недоступен."); } } });
  const view = await render(t, createElement(Drawer, { incident, seconds: -60, onClose() {}, onAssignTeam() {} }), services);
  const panel = view.container.querySelector('[aria-label="ИИ-подбор команды"]');
  await act(async () => panel.querySelector("button").click());
  assert.match(panel.querySelector('[role="alert"]').textContent, /ИИ-подбор недоступен/);
  assert.equal(panel.querySelector(".ai-rec-assign-btn"), null);
  assert.equal(panel.querySelector(".team-fit-result"), null);
  assert.equal(panel.querySelector("button").disabled, false);
});

test("updating the incident cancels an outstanding routing request and removes its result", async (t) => {
  const incident = { ...row("CDN-CHANGED", -1), updated: new Date(now).toISOString() };
  const pending = deferred();
  let signal;
  const services = defaults({ analysis: { recommendTeam: async (_id, _teams, requestSignal) => {
    signal = requestSignal; return pending.promise;
  } } });
  const props = { incident, seconds: -60, onClose() {}, onAssignTeam() {} };
  const view = await render(t, createElement(Drawer, props), services);
  await act(async () => view.container.querySelector('[aria-label="ИИ-подбор команды"] button').click());
  assert.equal(signal.aborted, false);
  await view.update(createElement(Drawer, { ...props, incident: { ...incident, updated: new Date(now + 1000).toISOString() } }));
  assert.equal(signal.aborted, true);
  await act(async () => pending.resolve({ incident_id: incident.id, team: { id: "infra", name: "ИТ-Инфраструктура" },
    match_percent: 100, reason: "Устаревший результат", incident_updated_at: incident.updated }));
  const panel = view.container.querySelector('[aria-label="ИИ-подбор команды"]');
  assert.equal(panel.querySelector(".ai-rec-assign-btn"), null);
  assert.doesNotMatch(panel.textContent, /Устаревший результат/);
});

test("team incident AI filtering runs on demand and carries confirmation on assignment", async (t) => {
  const { AssignIncidentModal } = await load("presentation/components/teams/AssignIncidentModal.tsx");
  const { TEAMS_DATA } = await load("data/teams.ts");
  const team = TEAMS_DATA.find((item) => item.id === "infra");
  const rows = ["fits", "unrelated"].map((id) => ({ ...row(id, 10), updated: new Date(now).toISOString() }));
  let calls = 0; const assigned = [];
  const services = defaults({ analysis: { recommendForTeam: async (profile) => {
    calls++; assert.equal(profile.id, team.id); assert.equal(profile.lead, undefined);
    return [{ incident_id: "fits", incident_updated_at: rows[0].updated, team: { id: team.id, name: team.name },
      match_percent: 86, reason: "Команда сопровождает инфраструктуру." }];
  } } });
  const view = await render(t, createElement(AssignIncidentModal, { team, incidents: rows,
    onClose() {}, onAssign: (...args) => assigned.push(args) }), services);
  assert.equal(calls, 0);
  assert.equal(view.container.querySelector(".ai-suggestion-box"), null);
  await act(async () => view.container.querySelector(".filter-pill-btn").click());
  assert.equal(calls, 1);
  assert.equal(view.container.querySelectorAll(".modal-incident-card").length, 1);
  assert.match(view.container.textContent, /86%/);
  await act(async () => view.container.querySelector(".filter-pill-btn").click());
  assert.equal(view.container.querySelectorAll(".modal-incident-card").length, 2);
  await act(async () => view.container.querySelector(".filter-pill-btn").click());
  assert.equal(calls, 1);
  await act(async () => view.container.querySelector(".assign-confirm-btn").click());
  assert.deepEqual(assigned, [["fits", team.name, true]]);
});

test("incident brief shows a short problem and next step separately", async (t) => {
  const { IncidentAnalysis } = await load("presentation/components/dashboard/IncidentAnalysis.tsx");
  const incident = { ...row("BRIEF", 15), updated: new Date(now).toISOString() };
  let calls = 0;
  const services = defaults({ analysis: { incident: async () => {
    calls++;
    return { incident_id: incident.id, incident_updated_at: incident.updated, generated_at: incident.updated,
      summary: "Ошибки авторизации.", next_step: "Уточните масштаб сбоя у ответственного.",
      related_incidents_used: [], limitations: [] };
  } } });
  const view = await render(t, createElement(IncidentAnalysis, { incident }), services);
  assert.equal(calls, 0);
  await act(async () => view.container.querySelector("button").click());
  assert.match(view.container.textContent, /Проблема: Ошибки авторизации/);
  assert.match(view.container.textContent, /Следующий шаг: Уточните масштаб/);
  assert.doesNotMatch(view.container.textContent, /Похожий случай/);
});

test("teams with active incidents counts only teams present in the registry", async (t) => {
  const { TeamsView } = await load("presentation/components/teams/TeamsView.tsx");
  const { TEAMS_DATA } = await load("data/teams.ts");
  const incidents = [
    { ...row("one", 5), team: TEAMS_DATA[1].name },
    { ...row("duplicate", 5), team: TEAMS_DATA[1].name },
    { ...row("two", 5), team: TEAMS_DATA[2].name },
    { ...row("resolved", 5), team: TEAMS_DATA[3].name, is_active: false, is_resolved: true, status: "Resolved" },
    ...Array.from({ length: 18 }, (_, index) => ({ ...row(`external-${index}`, 5), team: `Команда ITSM ${index}` })),
  ];
  const view = await render(t, createElement(TeamsView, { incidents, onSelectIncident() {} }), defaults());
  const filter = [...view.container.querySelectorAll(".pill-btn")].find((button) => button.textContent.includes("С инцидентами в работе"));
  assert.equal(filter.querySelector("span").textContent, "2");
  await act(async () => filter.click());
  assert.equal(view.container.querySelector(".teams-cards-grid").children.length, 2);
});

test("completion offers undo only after success and expires after thirty seconds", async (t) => {
  const { useIncidentActions } = await load("application/incidents/useIncidentActions.ts");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now });
  const incident = row("UNDO", 5);
  const saved = { ...incident, status: "Resolved", updated: new Date(now).toISOString(),
    undo_resolve_until: new Date(now + 30000).toISOString() };
  const applied = [], failures = [], requests = [];
  const view = await hook(t, useIncidentActions, defaults({ incidents: {
    resolve: async () => saved, undoResolve: async (...args) => { requests.push(args); return incident; }
  } }), [(item) => applied.push(item), (item) => failures.push(item), () => {}]);
  await act(async () => view.value.resolve(incident));
  assert.equal(view.value.undoable.length, 1);
  await act(async () => view.value.undoResolve(saved));
  assert.deepEqual(requests, [[incident.id, saved.updated]]);
  assert.equal(view.value.undoable.length, 0);
  assert.equal(applied.at(-1).status, "Assigned");
  await act(async () => view.value.resolve(incident));
  await tick(t, 30000);
  assert.equal(view.value.undoable.length, 0);
  assert.deepEqual(failures, []);
});

test("research exposes undo and final closure, and closed cards retain both authors", async (t) => {
  const research = { ...row("LIFECYCLE", 5), status: "Research", is_active: false, is_resolved: true,
    resolved_by: "Иванов Иван", groups: ["Исследование ситуации"] };
  const undone = [], closed = [];
  const props = { incident: research, seconds: 0, onClose() {},
    onUndoResolve: (item) => undone.push(item.id), onCloseIncident: (item) => closed.push(item.id) };
  const view = await render(t, createElement(Drawer, props), defaults());
  assert.match(view.container.textContent, /Решил: Иванов Иван/);
  const buttons = [...view.container.querySelectorAll(".drawer-actions button")];
  await act(async () => buttons.find((item) => item.textContent.includes("Вернуть в работу")).click());
  await act(async () => buttons.find((item) => item.textContent === "Закрыть инцидент").click());
  assert.deepEqual(undone, [research.id]); assert.deepEqual(closed, [research.id]);
  await view.update(createElement(Drawer, { ...props, incident: { ...research, status: "Closed", groups: [], closed_by: "Петров Пётр" } }));
  assert.match(view.container.textContent, /Решил: Иванов Иван/);
  assert.match(view.container.textContent, /Закрыл: Петров Пётр/);
  assert.doesNotMatch(view.container.querySelector(".drawer-actions").textContent, /Вернуть в работу|Закрыть инцидент/);
});

test("focus sound follows live top-three entries and ignores initial loading and revisions", async (t) => {
  const { useFocusAlerts } = await load("application/analysis/useFocusAlerts.ts");
  const sounds = [];
  const services = defaults({ sound: { play: (type) => sounds.push(type) } });
  const rows = [row("one", 5), row("two", 10), row("three", 15), row("four", 20)];
  const view = await hook(t, useFocusAlerts, services, [[], now, 30, false]);
  await view.rerender([rows, now, 30, true]);
  assert.deepEqual(sounds, []);
  await view.rerender([rows.map((item) => ({ ...item, updated: "v2" })), now + 1000, 30, true]);
  assert.deepEqual(sounds, []);
  await view.rerender([[...rows, row("outside-top", 25)], now, 30, true]);
  assert.deepEqual(sounds, []);
  await view.rerender([[row("new-one", 1), row("new-two", 2), ...rows], now, 30, true]);
  assert.deepEqual(sounds, ["focus"]);
  await view.rerender([[row("new-one", 1), row("new-two", 2), ...rows], now, 30, true]);
  assert.deepEqual(sounds, ["focus"]);
});

test("focus sound handles timer entry and silent period changes", async (t) => {
  const { useFocusAlerts } = await load("application/analysis/useFocusAlerts.ts");
  const sounds = [];
  const services = defaults({ sound: { play: (type) => sounds.push(type) } });
  const soon = row("soon", 1), later = row("later", 31);
  const view = await hook(t, useFocusAlerts, services, [[soon, later], now, 30, true]);
  await view.rerender([[soon, later], now + 60000, 30, true]);
  assert.deepEqual(sounds, ["focus"]);
  await view.rerender([[soon, later, row("hour", 55)], now + 60000, 60, true]);
  assert.deepEqual(sounds, ["focus"]);
  await view.rerender([[soon, later, row("hour", 55), row("new", 5)], now + 60000, 60, true]);
  assert.deepEqual(sounds, ["focus", "focus"]);
  await view.rerender([[], now + 60000, 60, true]);
  assert.deepEqual(sounds, ["focus", "focus"]);
});

test("focus monitoring survives navigation and keeps the chosen period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now });
  let observer;
  const sounds = [];
  const services = defaults({ sound: { play: (type) => sounds.push(type) }, incidents: {
    list: async () => [], subscribe: (value) => { observer = value; return () => {}; }
  } });
  const view = await render(t, createElement(DashboardPage, { user, onLogout() {}, signingOut: false }), services);
  const control = view.container.querySelector('select[aria-label="Время до просрочки"]');
  await act(async () => { control.value = "60"; control.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await act(async () => view.container.querySelector('nav button[aria-label^="Ассистент"]').click());
  await act(async () => observer.snapshot([row("new-focus", 45)]));
  assert.equal(sounds.filter((type) => type === "focus").length, 1);
  await act(async () => view.container.querySelector('nav button[aria-label="Инциденты"]').click());
  assert.equal(view.container.querySelector('select[aria-label="Время до просрочки"]').value, "60");
  assert.equal(sounds.filter((type) => type === "focus").length, 1);
});

test("board overdue toggle hides expired cards, restores them and follows timer changes", async (t) => {
  const { BoardPage } = await load("presentation/pages/BoardPage.tsx");
  const incidents = [row("expired-toggle", -2), row("future-toggle", 2)];
  let seconds = 120;
  const props = { incidents, query: "", now, incidentView: "all", focusWindow: 30,
    onFocusWindowChange() {}, onSetIncidentView() {}, onSelectIncident() {}, onResolveIncident() {},
    slaFor: (item) => item.id === "expired-toggle" ? -120 : seconds };
  const view = await render(t, createElement(BoardPage, props), defaults());
  const cards = () => Array.from(view.container.querySelectorAll('.board .incident-card')).map((card) => card.getAttribute('aria-label'));
  const toggle = () => view.container.querySelector('.overdue-visibility-toggle');
  assert.equal(cards().length, 2);
  assert.equal(toggle().textContent, "Скрыть просроченные");
  await act(async () => toggle().click());
  assert.equal(toggle().getAttribute("aria-pressed"), "true");
  assert.equal(cards().length, 1);
  assert.ok(cards()[0].startsWith("future-toggle:"));
  seconds = 0;
  await view.update(createElement(BoardPage, { ...props, slaFor: (item) => item.id === "expired-toggle" ? -120 : seconds }));
  assert.equal(cards().length, 0);
  await act(async () => toggle().click());
  assert.equal(cards().length, 2);
  assert.equal(toggle().getAttribute("aria-pressed"), "false");
});

test("teams page shows an external ITSM roster and supports empty search recovery", async (t) => {
  const { TeamsView } = await load("presentation/components/teams/TeamsView.tsx");
  const { TEAMS_DATA } = await load("data/teams.ts");
  const view = await render(t, createElement(TeamsView, { incidents: [], onAssignTeam() {}, onSelectIncident() {} }), defaults());
  assert.equal(view.container.querySelectorAll('.team-card').length, TEAMS_DATA.length);
  const roster = view.container.querySelector('.team-roster');
  assert.equal(roster.querySelectorAll('li').length, TEAMS_DATA[0].membersCount);
  assert.ok(roster.textContent.includes(TEAMS_DATA[0].lead.name));
  assert.ok(roster.querySelector('.itsm-source-badge').textContent.includes('ITSM'));
  const input = view.container.querySelector('.teams-search-box input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'no-such-team-or-participant');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(view.container.querySelectorAll('.team-card').length, 0);
  assert.ok(view.container.querySelector('.teams-empty-state'));
  await act(async () => view.container.querySelector('.teams-empty-state button').click());
  assert.equal(view.container.querySelectorAll('.team-card').length, TEAMS_DATA.length);
});

test("team selection survives a burst of SSE arrivals during AI analysis and appends arrivals after the snapshot", async (t) => {
  const { AssignIncidentModal } = await load("presentation/components/teams/AssignIncidentModal.tsx");
  const { TEAMS_DATA } = await load("data/teams.ts");
  const team = TEAMS_DATA.find((item) => item.id === "infra");
  const version = new Date(now).toISOString();
  const original = ["first", "second"].map((id) => ({ ...row(id, 10), updated: version }));
  const pending = deferred(), requests = [], assigned = [];
  const recommendation = (id, percent = 86) => ({ incident_id: id, incident_updated_at: version,
    team: { id: team.id, name: team.name }, match_percent: percent, reason: `Обоснование ${id}` });
  const services = defaults({ analysis: { recommendForTeam: async (_team, signal, ids) => {
    requests.push({ signal, ids }); return requests.length === 1 ? pending.promise : ids.map((id) => recommendation(id));
  } } });
  const props = { team, incidents: original, onClose() {}, onAssign: (...args) => assigned.push(args) };
  const view = await render(t, createElement(AssignIncidentModal, props), services);
  const ids = () => [...view.container.querySelectorAll('.inc-id-tag')].map((node) => node.textContent);
  const list = view.container.querySelector('.modal-incidents-list');
  list.scrollTop = 240;
  await act(async () => view.container.querySelector('.modal-team-summary .secondary-button').click());
  assert.deepEqual(requests[0].ids, ["first", "second"]);
  const arrivals = [];
  for (let index = 0; index < 50; index++) {
    arrivals.unshift({ ...row(`arrival-${index}`, 10), updated: version, groups: ["На координаторах"] });
    await view.update(createElement(AssignIncidentModal, { ...props, incidents: [...arrivals, ...original.slice().reverse()] }));
  }
  assert.equal(requests.length, 1);
  assert.equal(requests[0].signal.aborted, false);
  assert.equal(view.container.querySelector('.modal-incidents-list'), list);
  assert.equal(list.scrollTop, 240);
  assert.deepEqual(ids().slice(0, 4), ["first", "second", "arrival-0", "arrival-1"]);
  assert.match(view.container.querySelector('.selection-new-arrivals').textContent, /50/);
  await act(async () => pending.resolve([recommendation("second", 96), recommendation("first", 86)]));
  assert.deepEqual(ids().slice(0, 4), ["second", "first", "arrival-0", "arrival-1"]);
  assert.equal(view.container.querySelectorAll('.ai-suggestion-box').length, 2);
  await view.update(createElement(AssignIncidentModal, { ...props, incidents: [...arrivals.slice().reverse(), ...original] }));
  assert.deepEqual(ids().slice(0, 4), ["second", "first", "arrival-0", "arrival-1"]);
  await act(async () => view.container.querySelector('.filter-pill-btn').click());
  assert.deepEqual(ids(), ["second", "first"]);
  const input = view.container.querySelector('.modal-search input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'second');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const latest = { ...row("latest", 10), updated: version };
  await view.update(createElement(AssignIncidentModal, { ...props, incidents: [latest, ...arrivals, ...original] }));
  assert.equal(input.value, "second");
  assert.ok(view.container.querySelector('.filter-pill-btn').classList.contains('active'));
  assert.deepEqual(ids(), ["second"]);
  assert.equal(requests.length, 1);
  await act(async () => view.container.querySelector('.assign-confirm-btn').click());
  assert.deepEqual(assigned, [["second", team.name, true]]);
});

test("manual AI refresh includes appended incidents, preserves other results when one incident changes, and cancels on close", async (t) => {
  const { AssignIncidentModal } = await load("presentation/components/teams/AssignIncidentModal.tsx");
  const { TEAMS_DATA } = await load("data/teams.ts");
  const team = TEAMS_DATA.find((item) => item.id === "infra");
  const first = { ...row("first", 10), updated: new Date(now).toISOString() };
  const second = { ...row("second", 10), updated: first.updated };
  const third = { ...row("third", 10), updated: first.updated };
  const requests = [];
  const last = deferred();
  const services = defaults({ analysis: { recommendForTeam: async (_team, signal, ids) => {
    requests.push({ signal, ids });
    if (requests.length === 3) return last.promise;
    return ids.map((id) => ({ incident_id: id, incident_updated_at: first.updated, team: { id: team.id, name: team.name },
      match_percent: 86, reason: `Подходит ${id}` }));
  } } });
  const props = { team, incidents: [first, second], onClose() {}, onAssign() {} };
  const view = await render(t, createElement(AssignIncidentModal, props), services);
  const analyze = () => act(async () => view.container.querySelector('.modal-team-summary .secondary-button').click());
  await analyze();
  await view.update(createElement(AssignIncidentModal, { ...props, incidents: [third, second, first] }));
  assert.equal(view.container.querySelectorAll('.ai-suggestion-box').length, 2);
  await analyze();
  assert.deepEqual(requests[1].ids, ["first", "second", "third"]);
  assert.equal(view.container.querySelector('.selection-new-arrivals'), null);
  assert.equal(view.container.querySelectorAll('.ai-suggestion-box').length, 3);
  await view.update(createElement(AssignIncidentModal, { ...props,
    incidents: [{ ...first, updated: new Date(now + 1000).toISOString() }, second, third] }));
  assert.equal(view.container.querySelectorAll('.ai-suggestion-box').length, 2);
  assert.equal(requests.length, 2);
  await analyze();
  await view.unmount();
  assert.equal(requests[2].signal.aborted, true);
  await act(async () => last.resolve([]));
});
