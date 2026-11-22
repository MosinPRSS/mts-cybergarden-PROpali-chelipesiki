import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createBrowserPwa } from "../src/infrastructure/browser/pwa.ts";

function setup(t) {
  const dom = new JSDOM("", { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  let options, activations = 0;
  const gateway = createBrowserPwa((value) => { options = value; return async () => { activations++; }; });
  t.after(() => { dom.window.close(); globalThis.window = previous.window; globalThis.document = previous.document;
    Object.defineProperty(globalThis, "navigator", previous.navigator); });
  return { gateway, options, dom, get activations() { return activations; } };
}

test("installation requires a browser prompt and consumes it once", async (t) => {
  const { gateway, dom } = setup(t);
  let prompts = 0;
  assert.equal(gateway.getSnapshot().installAvailable, false);
  await gateway.install(); assert.equal(prompts, 0);
  const event = new dom.window.Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => { prompts++; };
  event.userChoice = Promise.resolve({ outcome: "dismissed" });
  dom.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(gateway.getSnapshot().installAvailable, true);
  await gateway.install(); await gateway.install();
  assert.equal(prompts, 1); assert.equal(gateway.getSnapshot().installAvailable, false);
  dom.window.dispatchEvent(new dom.window.Event("appinstalled"));
  assert.equal(gateway.getSnapshot().installed, true);
});

test("new workers and activation in another tab never trigger an automatic update", async (t) => {
  const view = setup(t);
  view.options.onNeedRefresh();
  assert.equal(view.gateway.getSnapshot().updateAvailable, true);
  assert.equal(view.gateway.getSnapshot().updating, false);
  assert.equal(view.activations, 0);
  view.options.onNeedReload();
  assert.equal(view.activations, 0);
  assert.equal(view.gateway.getSnapshot().updating, false);
});

test("updates require connectivity and a waiting version; subscribers can unsubscribe", async (t) => {
  const view = setup(t); let changes = 0;
  const unsubscribe = view.gateway.subscribe(() => { changes++; });
  await view.gateway.update(); assert.equal(view.activations, 0);
  view.options.onNeedRefresh();
  view.dom.window.dispatchEvent(new view.dom.window.Event("offline"));
  assert.equal(view.gateway.getSnapshot().online, false);
  await view.gateway.update(); assert.equal(view.activations, 0);
  view.dom.window.dispatchEvent(new view.dom.window.Event("online"));
  await view.gateway.update(); assert.equal(view.activations, 1);
  assert.equal(view.gateway.getSnapshot().updating, true);
  await view.gateway.update(); assert.equal(view.activations, 1);
  assert.equal(changes, 4);
  unsubscribe(); view.dom.window.dispatchEvent(new view.dom.window.Event("offline"));
  assert.equal(changes, 4);
});
