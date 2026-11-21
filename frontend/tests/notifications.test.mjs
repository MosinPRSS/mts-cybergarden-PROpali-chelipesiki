import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotification,
  formatNotificationTime,
  seedInitialNotifications,
  loadNotifications,
  saveNotifications,
  MAX_NOTIFICATIONS_STORED,
} from "../src/lib/notifications.ts";

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
