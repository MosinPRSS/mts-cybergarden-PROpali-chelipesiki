import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, fetchCurrentUser, login, logout } from "../src/lib/auth.ts";

const user = { id: 1, login: "ivan", full_name: "Иванов Иван", role: "coordinator" };

test("authentication uses same-origin cookies and never returns a browser-stored token", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return url.endsWith("logout") ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } });
  });
  assert.deepEqual(await login({ login: "ivan", password: "a long passphrase" }), user);
  assert.deepEqual(await fetchCurrentUser(), user);
  assert.equal(await logout(), undefined);
  assert.deepEqual(requests.map(({ url }) => url), ["/api/auth/login", "/api/auth/me", "/api/auth/logout"]);
  for (const { options } of requests) {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers?.Authorization, undefined);
  }
  assert.equal(requests[1].options.method, "GET");
  assert.equal(requests[2].options.method, "POST");
});

test("wrong credentials and expired sessions remain distinguishable by HTTP status", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ detail: "Неверный логин или пароль" }), { status: 401 }));
  await assert.rejects(login({ login: "ivan", password: "wrong" }), (error) => error instanceof AuthError && error.status === 401 && error.message === "Неверный логин или пароль");
});

test("network and non-JSON server failures have readable messages", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(fetchCurrentUser(), (error) => error instanceof AuthError && error.status === 0 && error.message.includes("сервером"));
  mock.mock.mockImplementation(async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(fetchCurrentUser(), (error) => error instanceof AuthError && error.status === 503 && error.message.includes("недоступен"));
});

test("login and session restore refuse all roles except coordinator", async (t) => {
  const mock = t.mock.method(globalThis, "fetch");
  for (const role of ["admin", "engineer", "observer"]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ ...user, role }), { headers: { "Content-Type": "application/json" } }));
    const denied = (error) => error instanceof AuthError && error.status === 403 && error.message.includes("только координаторам");
    await assert.rejects(login({ login: "ivan", password: "correct" }), denied);
    await assert.rejects(fetchCurrentUser(), denied);
  }
});
