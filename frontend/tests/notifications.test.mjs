import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotification,
  seedInitialNotifications,
  MAX_NOTIFICATIONS_STORED,
  incidentNotifications,
} from "../src/domain/notifications/events.ts";
import { loadNotifications, saveNotifications } from "../src/infrastructure/browser/notificationStorage.ts";
import { createDesktopNotifications } from "../src/infrastructure/browser/desktopNotifications.ts";
import { formatNotificationTime } from "../src/presentation/formatters.ts";

test("a batch retains every critical, coordinator and resolution event", () => {
  const row = (id, groups, status = "Assigned") => ({ id, groups, status, updated: "v2", service: "Продукт" });
  const previous = new Map([["old", row("old", ["Критические"])]]);
  const current = [row("both", ["Критические", "На координаторах"]),
    row("second", ["Критические"]), row("old", [], "Resolved")];
  const events = incidentNotifications(previous, current);
  assert.deepEqual(events.map((item) => [item.incidentId, item.type]), [
    ["both", "critical"], ["both", "assigned"], ["second", "critical"], ["old", "resolved"],
  ]);
  assert.equal(events[3].title, "Критический инцидент решён");
  assert.equal(new Set(events.map((item) => item.id)).size, 4);
  assert.deepEqual(incidentNotifications(new Map(current.map((item) => [item.id, item])), current), []);
});

test("the first incident after an empty snapshot is announced", () => {
  const events = incidentNotifications(new Map(), [{ id: "first", service: "Продукт", updated: "v1", groups: ["Критические", "На координаторах"] }]);
  assert.deepEqual(events.map((item) => item.type), ["critical", "assigned"]);
});

test("createNotification initializes correctly with defaults", () => {
  const notif = createNotification({
    type: "critical",
    title: "Тестовый инцидент",
    message: "🚨 Описание проблемы",
    incidentId: "INC001",
    service: "Сервис А",
  });

  assert.ok(notif.id.startsWith("notif_"));
  assert.equal(notif.type, "critical");
  assert.equal(notif.title, "Тестовый инцидент");
  assert.equal(notif.message, "🚨 Описание проблемы");
  assert.equal(notif.incidentId, "INC001");
  assert.equal(notif.service, "Сервис А");
  assert.equal(notif.read, false);
  assert.ok(!Number.isNaN(new Date(notif.timestamp).getTime()));
});

test("formatNotificationTime returns relative times for recent events", () => {
  const now = Date.now();
  assert.equal(formatNotificationTime(new Date(now - 10 * 1000).toISOString()), "только что");
  assert.equal(formatNotificationTime(new Date(now - 5 * 60 * 1000).toISOString()), "5 мин. назад");
  assert.equal(formatNotificationTime(new Date(now - 3 * 3600 * 1000).toISOString()), "3 ч. назад");
  
  const oldDate = new Date("2026-05-10T12:30:00Z");
  const formatted = formatNotificationTime(oldDate.toISOString());
  assert.ok(formatted.includes(":"));
});

test("seedInitialNotifications creates notifications for critical and coordinator incidents", () => {
  const incidents = [
    {
      id: "INC1",
      priority: "Критический",
      priorityId: 4,
      service: "Авторизация",
      area: "Backend",
      summary: "Сбой шлюза",
      team: "DevOps",
      sla: null,
      affected: "Высокое",
      ai: "",
      updated: "2026-11-21T08:00:00Z",
      status: "Assigned",
      is_active: true,
      groups: ["Критические"],
    },
    {
      id: "INC2",
      priority: "Средний",
      priorityId: 2,
      service: "Биллинг",
      area: "DB",
      summary: "Медленный запрос",
      team: "КЦ ИТ Координаторы Массовых Инцидентов",
      sla: null,
      affected: "Среднее",
      ai: "",
      updated: "2026-11-21T07:30:00Z",
      status: "Assigned",
      is_active: true,
      groups: ["На координаторах"],
    },
    {
      id: "INC3",
      priority: "Низкий",
      priorityId: 1,
      service: "Портал",
      area: "Frontend",
      summary: "Опечатка",
      team: "Другая команда",
      sla: null,
      affected: "Низкое",
      ai: "",
      updated: "2026-11-21T06:00:00Z",
      status: "Assigned",
      is_active: true,
      groups: [],
    },
  ];

  const seeded = seedInitialNotifications(incidents);
  assert.equal(seeded.length, 2);

  const crit = seeded.find((s) => s.incidentId === "INC1");
  assert.ok(crit);
  assert.equal(crit.type, "critical");
  assert.equal(crit.read, false);

  const coord = seeded.find((s) => s.incidentId === "INC2");
  assert.ok(coord);
  assert.equal(coord.type, "assigned");
  assert.equal(coord.read, true);
});

test("loadNotifications and saveNotifications interact with localStorage safely", () => {
  const mockStorage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
    },
  };

  const sample = [
    createNotification({
      type: "info",
      title: "Инфо",
      message: "Тест",
    }),
  ];

  saveNotifications(sample);
  const loaded = loadNotifications();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].title, "Инфо");

  // Check truncation to MAX_NOTIFICATIONS_STORED
  const bigList = Array.from({ length: 150 }, (_, i) =>
    createNotification({ type: "info", title: `Item ${i}`, message: `M ${i}` })
  );
  saveNotifications(bigList);
  const reloaded = loadNotifications();
  assert.equal(reloaded.length, MAX_NOTIFICATIONS_STORED);
});

test("notification history is isolated between signed-in accounts", (t) => {
  const storage = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const notification = createNotification({ type: "info", title: "Для первого", message: "История первого пользователя" });
  saveNotifications([notification], 1);
  assert.deepEqual(loadNotifications(1), JSON.parse(JSON.stringify([notification])));
  assert.deepEqual(loadNotifications(2), []);
});

test("desktop notifications adapter correctly handles permissions and shows only when granted", async (t) => {
  const previousWindow = globalThis.window;

  // 1. Unsupported when window.Notification is missing
  globalThis.window = {};
  delete globalThis.window.Notification;
  const unsupportedAdapter = createDesktopNotifications();
  assert.equal(unsupportedAdapter.isSupported(), false);
  assert.equal(unsupportedAdapter.getPermission(), "unsupported");
  assert.equal(await unsupportedAdapter.requestPermission(), "unsupported");

  // 2. Supported with default permission
  let permissionValue = "default";
  let createdNotifications = [];
  class MockNotification {
    constructor(title, options) {
      this.title = title;
      this.options = options;
      createdNotifications.push({ title, options });
    }
    static get permission() {
      return permissionValue;
    }
    static async requestPermission() {
      permissionValue = "granted";
      return permissionValue;
    }
  }

  globalThis.window = {
    Notification: MockNotification,
  };

  t.after(() => {
    globalThis.window = previousWindow;
  });

  const adapter = createDesktopNotifications();
  assert.equal(adapter.isSupported(), true);
  assert.equal(adapter.getPermission(), "default");

  // notify does nothing when permission is default
  adapter.notify("Тест", { body: "Текст" });
  assert.equal(createdNotifications.length, 0);

  // requestPermission asks and grants
  const requested = await adapter.requestPermission();
  assert.equal(requested, "granted");
  assert.equal(adapter.getPermission(), "granted");

  // notify creates notification when granted
  adapter.notify("Критический инцидент INC-1", { body: "Сбой шлюза", tag: "critical-INC-1" });
  assert.equal(createdNotifications.length, 1);
  assert.equal(createdNotifications[0].title, "Критический инцидент INC-1");
  assert.equal(createdNotifications[0].options.body, "Сбой шлюза");
  assert.equal(createdNotifications[0].options.tag, "critical-INC-1");
});

