"""Генератор случайных инцидентов для демонстрации.

Отправляет POST /api/incidents на работающий бэкенд.
Поддерживает однократную генерацию и режим непрерывной генерации.

Использование
-------------
  # Отправить один инцидент:
  python generator.py

  # Отправить 5 инцидентов с паузой 3 секунды между ними:
  python generator.py --count 5 --interval 3

  # Непрерывный режим (каждые 10 секунд, Ctrl+C для остановки):
  python generator.py --count 0 --interval 10

  # Указать адрес сервера (по умолчанию http://localhost:8000):
  python generator.py --url http://localhost:8000
"""

import argparse
import json
import random
import string
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone


# ---------------------------------------------------------------------------
# Справочники
# ---------------------------------------------------------------------------

STATES = [
    {"stateId": 0, "stateEnum": "Assigned",       "state": "Назначен"},
    {"stateId": 2, "stateEnum": "WorkInProgress",  "state": "В работе"},
    {"stateId": 7, "stateEnum": "Resolved",        "state": "Решён"},
    {"stateId": 10, "stateEnum": "Closed",         "state": "Закрыт"},
    {"stateId": 20, "stateEnum": "Research",       "state": "Исследование"},
]

PRIORITIES = [
    {"priorityId": 1, "priority": "Низкий",    "urgencyId": 1, "urgency": "Низкая",    "impactId": 1, "impact": "Низкий"},
    {"priorityId": 2, "priority": "Средний",   "urgencyId": 2, "urgency": "Средняя",   "impactId": 2, "impact": "Средний"},
    {"priorityId": 3, "priority": "Высокий",   "urgencyId": 3, "urgency": "Высокая",   "impactId": 3, "impact": "Высокий"},
    {"priorityId": 4, "priority": "Наивысший", "urgencyId": 4, "urgency": "Наивысшая", "impactId": 4, "impact": "Критический"},
]

SERVICE_TYPES = [
    {"serviceTypeId": 10, "serviceType": "Пользовательский"},
    {"serviceTypeId": 20, "serviceType": "Бизнес-процессный"},
    {"serviceTypeId": 30, "serviceType": "Технологический"},
]

TEAMS = [
    "КЦ ИТ Координаторы Массовых Инцидентов",
    "Digital Platform",
    "B2C Digital",
    "UC Platform",
    "Банковские системы",
    "ИТ-Инфраструктура",
    "Платёжные Системы",
    "Messaging Core",
    "Security Operations",
    "Data Platform",
]

PRODUCTS = [
    {"productName": "МТС Деньги",      "productId": "MTS_MONEY",   "productMasterId": "BI_001"},
    {"productName": "Мой МТС",         "productId": "MY_MTS",      "productMasterId": "BI_002"},
    {"productName": "МТС Банк",        "productId": "MTS_BANK",    "productMasterId": "BI_003"},
    {"productName": "МТС Live",        "productId": "MTS_LIVE",    "productMasterId": "BI_004"},
    {"productName": "МТС Линк",        "productId": "MTS_LINK",    "productMasterId": "BI_005"},
    {"productName": "МТС ID",          "productId": "MTS_ID",      "productMasterId": "BI_006"},
    {"productName": "МТС Маркетолог",  "productId": "MTS_MKTG",    "productMasterId": "BI_007"},
    {"productName": "Автопроматриватель TicTok", "productId": "TIKTOK_WATCHER", "productMasterId": "BI_008"},
    {"productName": "МТС Экосистема",  "productId": "MTS_ECO",     "productMasterId": "BI_009"},
    {"productName": "МТС Облако",      "productId": "MTS_CLOUD",   "productMasterId": "BI_010"},
]

SERVICES = [
    "API Gateway", "Авторизация", "Платёжный контур", "SSO", "CDN",
    "Очередь событий", "База данных", "Кэш-слой", "Мониторинг", "Нотификации",
    "Загрузка файлов", "Вебхуки", "Биллинг", "Отчётность", "Видеостриминг",
]

SCENARIOS = [
    "Деградация сервиса", "Полная недоступность", "Аномальный рост ошибок",
    "Превышение SLA", "Инцидент безопасности", "Массовый сбой клиентов",
    "Потеря данных", "Перегрузка инфраструктуры", "Плановые работы вышли из-под контроля",
]

HEADERS = [
    "Резкий рост ошибок {code} в {service}",
    "Недоступность {service} для клиентов",
    "Деградация производительности {service}",
    "Автоматический алерт: {service} показывает отклонения от нормы",
    "Массовые жалобы клиентов на работу {service}",
    "Превышение порогового значения latency в {service}",
    "Сбой репликации в {service}",
    "Аномальное потребление ресурсов в {service}",
]

EMPLOYEES = [
    ("Гадюкин Фёдор", "unclefedor"),
    ("Пятачок Игорь", "piglet"),
    ("Романов Алексей", "alexey.romanov"),
    ("Власова Ирина", "irina.vlasova"),
    ("Орлов Дмитрий", "dmitry.orlov"),
    ("Волков Сергей", "sergey.volkov"),
    ("Котова Мария", "maria.kotova"),
    ("Иванов Иван", "ivan.ivanov"),
    ("Петров Пётр", "petr.petrov"),
]

INITIATORS = [
    ("Мониторинг (auto-alert)", "monitoring"),
    ("Пятачок Игорь", "piglet"),
    ("Колокольников Роман", "kolokolnikov"),
    ("Дежурный инженер", "oncall"),
    ("ServiceDesk Bot", "sd-bot"),
]

CHANNELS = ["Автоматический", "Телефон", "Email", "Портал самообслуживания", "Telegram"]

INC_TYPES = ["МИ", "ИНЦ", "P1", "P2"]

STATE_REASONS = ["Нет", "Ожидание ответа", "Ожидание патча", "Ожидание инфраструктуры"]

ERROR_CODES = ["5xx", "4xx", "503", "500", "502", "504", "429"]


# ---------------------------------------------------------------------------
# Генерация одного инцидента
# ---------------------------------------------------------------------------

def _rand_str(prefix: str = "SYS", length: int = 18) -> str:
    return prefix + "".join(random.choices(string.digits, k=length))


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def generate_incident() -> dict:
    now = datetime.now(timezone.utc)

    state_rec = random.choices(
        STATES,
        weights=[30, 30, 15, 10, 15],  # больше активных (Assigned/WIP) для наглядности
    )[0]
    priority_rec = random.choices(
        PRIORITIES,
        weights=[20, 30, 25, 25],  # больше критических (priorityId=4) для демонстрации
    )[0]
    svc_type_rec = random.choice(SERVICE_TYPES)
    product_rec = random.choice(PRODUCTS)
    team = random.choice(TEAMS)
    employee_name, employee_login = random.choice(EMPLOYEES)
    initiator_name, initiator_login = random.choice(INITIATORS)
    service = random.choice(SERVICES)
    scenario = random.choice(SCENARIOS)
    channel = random.choice(CHANNELS)
    inc_type = random.choice(INC_TYPES)

    submit_date = now - timedelta(minutes=random.randint(5, 240))

    # deadline зависит от приоритета
    deadline_hours = {4: 1, 3: 4, 2: 8, 1: 24}[priority_rec["priorityId"]]
    deadline = submit_date + timedelta(hours=deadline_hours)

    is_resolved = state_rec["stateId"] in (7, 10, 20)
    completion_date: datetime | None = None
    if is_resolved:
        completion_date = submit_date + timedelta(
            minutes=random.randint(10, deadline_hours * 60 - 5)
        )

    header = random.choice(HEADERS).format(
        service=service,
        code=random.choice(ERROR_CODES),
    )
    short_description = header[:120]
    description = (
        f"Автоматически зафиксирован сбой в сервисе «{service}» "
        f"(продукт {product_rec['productName']}). "
        f"Сценарий использования: {scenario}. "
        f"Инцидент передан команде «{team}» для анализа и устранения."
    )

    inc_id = "INC" + "".join(random.choices(string.digits, k=15))
    sys_id = _rand_str("SYS", 18)

    record = {
        "sysId": sys_id,
        "id": inc_id,
        "state": state_rec["state"],
        "stateEnum": state_rec["stateEnum"],
        "stateId": state_rec["stateId"],
        "stateReason": random.choice(STATE_REASONS) if not is_resolved else "Решено",
        "stateReasonId": str(random.randint(1, 5)),
        "submitDate": _iso(submit_date),
        "deadline": _iso(deadline),
        "completionDate": _iso(completion_date) if completion_date else None,
        "lastAssignmentToTeamDateTime": _iso(submit_date + timedelta(minutes=random.randint(0, 10))),
        "header": header,
        "description": description,
        "shortDescription": short_description,
        "assignedGroupName": team,
        "assignedEmployee": employee_name,
        "assignedEmployeeLogin": employee_login,
        "initiatorName": initiator_name,
        "initiatorLogin": initiator_login,
        "isEffect": random.random() < 0.15,
        "isReason": random.random() < 0.10,
        "isDouble": False,
        "isMaster": random.random() < 0.05,
        "incType": inc_type,
        "serviceTypeId": svc_type_rec["serviceTypeId"],
        "serviceType": svc_type_rec["serviceType"],
        "priorityId": priority_rec["priorityId"],
        "priority": priority_rec["priority"],
        "urgencyId": priority_rec["urgencyId"],
        "urgency": priority_rec["urgency"],
        "impactId": priority_rec["impactId"],
        "impact": priority_rec["impact"],
        "waitingExitDate": None,
        "isRootIncident": random.random() < 0.08,
        "productName": product_rec["productName"],
        "productId": product_rec["productId"],
        "productMasterId": product_rec["productMasterId"],
        "productUrl": None,
        "service": service,
        "serviceId": None,
        "scenarioName": scenario,
        "isNeedUp": None,
        "eliminationType": None,
        "eliminationTypeId": None,
        "receivingChannel": channel,
        "solution": "Расследование ведётся." if not is_resolved else "Инцидент устранён.",
    }
    return record


# ---------------------------------------------------------------------------
# HTTP-запрос (stdlib, без зависимостей)
# ---------------------------------------------------------------------------

def post_incident(url: str, payload: dict) -> tuple[int, dict]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Генератор случайных инцидентов для демонстрации.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--url", default="http://localhost:8000",
        help="Базовый адрес бэкенда (по умолчанию: http://localhost:8000)",
    )
    parser.add_argument(
        "--count", type=int, default=1,
        help="Сколько инцидентов сгенерировать (0 = бесконечно)",
    )
    parser.add_argument(
        "--interval", type=float, default=0.0,
        help="Пауза между запросами в секундах (по умолчанию: 0)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Только вывести сгенерированный JSON, не отправлять на сервер",
    )
    args = parser.parse_args()

    endpoint = args.url.rstrip("/") + "/api/incidents"
    infinite = args.count == 0
    sent = 0

    print(f"Цель: {endpoint}")
    print(f"Режим: {'бесконечный' if infinite else args.count} инцидентов, интервал {args.interval}с\n")

    try:
        while infinite or sent < args.count:
            incident = generate_incident()

            if args.dry_run:
                print(json.dumps(incident, ensure_ascii=False, indent=2))
                sent += 1
                if args.interval > 0:
                    time.sleep(args.interval)
                continue

            status, response = post_incident(endpoint, incident)
            ts = datetime.now().strftime("%H:%M:%S")
            if 200 <= status < 300:
                action = "создан" if response.get("created") else "обновлён"
                sse = response.get("sseNotified", 0)
                print(
                    f"[{ts}] ✓ {incident['id']} | {incident['priority']} | "
                    f"{incident['stateEnum']:<17} | {action}, SSE→{sse} клиентов"
                )
            else:
                print(f"[{ts}] ✗ {incident['id']} | HTTP {status} | {response}")

            sent += 1
            if (infinite or sent < args.count) and args.interval > 0:
                time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\nОстановлено. Отправлено инцидентов: {sent}")


if __name__ == "__main__":
    main()
