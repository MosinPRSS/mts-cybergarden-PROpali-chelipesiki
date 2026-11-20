# MTS Incident Command Backend

FastAPI бэкенд для оперативного центра инцидентов МТС (Кейс от МТС).

## Возможности
- Раздача статического дашборда инцидентов (`/dashboard/` и редирект с `/`)
- REST API для получения текущих инцидентов (`GET /api/incidents`)
- Real-time Server-Sent Events поток (`GET /api/incidents/stream`): при любом изменении файла `dashboard/incidents.json` на диске новые данные мгновенно рассылаются во все открытые вкладки дашборда без перезагрузки страницы
- Аутентификация и регистрация пользователей (`POST /api/register`, `POST /api/auth`)

## Быстрый старт

```bash
# 1. Активировать виртуальное окружение
.venv\Scripts\activate

# 2. Установить зависимости (если ещё не установлены)
pip install -r requirements.txt

# 3. Запустить сервер
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

После запуска:
- Дашборд доступен по адресу: **http://localhost:8000/dashboard/** (или просто **http://localhost:8000/**)
- Swagger документация API: **http://localhost:8000/docs**

## Live-обновление данных

Файл `dashboard/incidents.json` служит источником данных об инцидентах.  
Измените любой параметр (статус, SLA, влияние, сервис, AI-рекомендацию) и сохраните файл — открытый в браузере дашборд тут же обновит отображение в режиме реального времени!

## Структура

```
backend/
├── main.py               ← Точка входа FastAPI
├── requirements.txt      ← Python-зависимости
├── core/                 ← Конфигурация, БД, безопасность
├── models/               ← Схемы Pydantic и модели SQLAlchemy
├── routers/              ← Маршруты auth и incidents (с SSE-стримингом)
└── dashboard/            ← Веб-дашборд
    ├── index.html        ← Скомпилированный SPA дашборд
    ├── assets/           ← Стили и скрипты
    └── incidents.json    ← Файл данных инцидентов
```
