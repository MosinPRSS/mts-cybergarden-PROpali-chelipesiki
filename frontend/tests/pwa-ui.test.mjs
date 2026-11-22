import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL("../", import.meta.url)),
  plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
const { ServicesContext } = await vite.ssrLoadModule("/src/application/servicesContext.ts");
const { PwaShell } = await vite.ssrLoadModule("/src/presentation/components/layout/PwaShell.tsx");
after(async () => { await vite.close(); dom.window.close(); });

async function render(t, initial = {}) {
  // Other suites may replace these globals when run with --test-isolation=none.
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  let state = { online: true, installAvailable: false, iosInstallHint: false, installed: false,
    updateAvailable: true, updating: false, error: "", ...initial };
  let updates = 0, installs = 0; const listeners = new Set();
  const pwa = { getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update: async () => { updates++; }, install: async () => { installs++; } };
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(createElement(ServicesContext.Provider, { value: { pwa } },
    createElement(PwaShell, null, createElement("input", { defaultValue: "Черновик назначения" })))));
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  return { container, get updates() { return updates; }, get installs() { return installs; },
    async patch(patch) { await act(async () => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }); } };
}
const button = (view, text) => [...view.container.querySelectorAll("button")].find(el => el.textContent === text);

test("an open assignment dialog, AI analysis or pending save blocks updates", async (t) => {
  const view = await render(t);
  for (const attributes of [{ role: "dialog" }, { "aria-busy": "true" }, { "data-pwa-busy": "true" }]) {
    const work = document.createElement("div");
    for (const [key, value] of Object.entries(attributes)) work.setAttribute(key, value);
    // Even a click before MutationObserver runs must be guarded.
    await act(async () => { document.body.append(work); button(view, "Обновить").click(); });
    assert.equal(view.updates, 0); assert.equal(button(view, "Обновить").disabled, true);
    await act(async () => work.remove()); assert.equal(button(view, "Обновить").disabled, false);
  }
  await act(async () => button(view, "Обновить").click()); assert.equal(view.updates, 1);
});

test("offline blocks actions without unmounting work, then reconnect restores it", async (t) => {
  const view = await render(t); const input = view.container.querySelector("input"); input.value = "Сохранённый ввод";
  await view.patch({ online: false });
  assert.equal(view.container.querySelector(".pwa-content").hasAttribute("inert"), true);
  assert(view.container.querySelector('[role="alertdialog"]'));
  await view.patch({ online: true });
  assert.equal(view.container.querySelector("input"), input);
  assert.equal(input.value, "Сохранённый ввод");
  assert.equal(view.container.querySelector(".pwa-content").hasAttribute("inert"), false);
  assert.equal(view.container.querySelector('[role="alertdialog"]'), null);
});

test("update can be deferred and installation is only offered when available", async (t) => {
  const view = await render(t);
  await act(async () => button(view, "Позже").click());
  assert.equal(button(view, "Обновить"), undefined); assert.equal(view.updates, 0);
  await act(async () => button(view, "Доступно обновление").click());
  assert(button(view, "Обновить"));
  await view.patch({ error: "Обновление не завершилось" });
  await act(async () => button(view, "Позже").click());
  assert.equal(button(view, "Обновить"), undefined);
  await view.patch({ updateAvailable: false, error: "" });
  assert.equal(button(view, "Установить приложение"), undefined);
  await view.patch({ installAvailable: true });
  await act(async () => button(view, "Установить приложение").click()); assert.equal(view.installs, 1);
  await view.patch({ installed: true }); assert.equal(button(view, "Установить приложение"), undefined);
});
