# erik · backend

REST API волонтёрской платформы **erik** (Tech Vision 2026 · Community Engagement).
Flask + SQLAlchemy + JWT. Обслуживает сборы, прогноз явки, отметку присутствия, штаб
организатора, соц-слой (НКО, помощь, сообщения) и модерацию.

Корневой обзор проекта — в [../README.md](../README.md). Модель прогноза — в [../ml/README.md](../ml/README.md).

## Стек

- **Flask 3** — фабрика приложения (`create_app`), 8 блюпринтов, единые error-handlers.
- **SQLAlchemy 2** + **Flask-Migrate** — ORM и миграции.
- **Flask-JWT-Extended** — access/refresh-токены; device-вход выдаёт токен без пароля.
- **Flask-CORS**, **python-dotenv**, тесты — **pytest**, контейнеризация — **Docker**.

## Личность (identity) — ключевое решение

Один класс `User` — универсальный актор, три состояния:

- **device-участник** — `User` с `device_id` (токен выдаётся по заголовку `X-Device-Id`,
  без email и пароля). Так волонтёр отвечает на сбор без регистрации — снимает барьер
  «страшно регистрироваться».
- **аккаунт НКО / координатора** — тот же `User` + `email` + `password_hash`.
- **админ** — `User` с `user_type='admin'`.

Продуктовые агрегаты явки (`trust_came`, `trust_total`, `reliability`, `hours_total`)
пишет **только сервер** при финализации сбора — они же питают прогноз и рейтинг.

## Запуск

```bash
cd backend
python -m venv venv
venv\Scripts\activate                 # Windows (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt

copy .env.example .env                # заполнить SECRET_KEY / JWT_SECRET_KEY / CORS_ORIGINS

flask seed-demo                       # детерминированная демо-синтетика (сбор PARK18 + участники)
python app.py                         # → http://localhost:5000/api

pytest tests/ -v                      # тесты
```

Docker:

```bash
docker compose up --build
```

Полезные CLI-команды: `flask seed-demo [--reset]`, `flask create-admin`, `flask init_db`.

> Для разработки схема поднимается через `db.create_all()` (zero-config). В проде —
> миграции (`flask db upgrade`) и запуск с `SKIP_DB_CREATE=1`, через WSGI (gunicorn),
> а не `app.run`.

## Структура

```
backend/
├── app.py              # фабрика create_app, error-handlers, JWT-колбэки, CLI
├── config.py           # Development / Testing / Production + validate_config()
├── models.py           # db + все модели (User, Gathering, Participant, ...)
├── seed.py             # детерминированная демо-синтетика
├── routes/             # блюпринты (по одному на домен)
│   ├── auth.py         # аккаунты: register / login / refresh / me / profile / password
│   ├── session.py      # device-вход, /me, /logout
│   ├── gatherings.py   # сборы координатора: create / forecast / check-in / finalize
│   ├── guest.py        # участник по коду: просмотр + RSVP
│   ├── platform.py     # лента событий, НКО, charity, рейтинг, города
│   ├── organizer.py    # штаб: заявки волонтёров, база волонтёров
│   ├── notifications.py# уведомления
│   └── admin.py        # администрирование пользователей
├── services/           # бизнес-логика (тонкие роуты, толстые сервисы)
│   ├── forecast.py     # аналитический прогноз явки + финализация сбора
│   ├── attendance_ml.py# мост к обучаемой ML-модели (../ml), мягкая деградация
│   ├── context.py      # ctx-множитель (время/погода/расстояние)
│   ├── identity.py     # разрешение текущего актора (device + JWT)
│   ├── codes.py        # генерация кодов сборов
│   └── notifications.py# создание уведомлений/напоминаний
├── utils/              # decorators (owner/profiled guard), serializers, request-хелперы
├── tests/              # pytest: conftest + тесты
├── migrations/         # Flask-Migrate
└── Dockerfile · docker-compose.yml · entrypoint.sh · requirements.txt · .env.example
```

## API

База: `/api`. `GET /api` отдаёт версию и карту разделов. Токен — в `Authorization: Bearer …`,
device-личность — в `X-Device-Id`.

| Блюпринт | Префикс | Назначение |
|---|---|---|
| **session** | `/api/session`, `/api/me`, `/api/logout` | device-вход, текущий профиль, выход |
| **auth** | `/api/auth/*` | аккаунты email/пароль: register, login, refresh, me, profile, смена пароля |
| **gatherings** | `/api/gatherings/*` | создание сбора, просмотр владельцем, **прогноз**, поллинг, ростер, **отметка явки** (в т.ч. офлайн-синк), финализация |
| **guest** | `/api/g/<code>`, `/api/gatherings/by-code` | участник по коду: просмотр и **RSVP** без регистрации |
| **platform** | `/api/events`, `/orgs`, `/charity`, `/leaderboard`, `/cities` | лента, НКО, помощь, рейтинг, справочники |
| **organizer** | `/api/me/org/*`, `/api/events/<id>/applications`, `/api/applications/*` | штаб: заявки волонтёров и база |
| **notifications** | `/api/notifications*` | список и отметка прочитанного |
| **admin** | `/api/admin/users*` | список/смена статуса пользователей (только admin) |

Ключевые эндпоинты прогноза (владелец-координатор):

```
GET /api/gatherings/<id>/forecast      # аналитический E ± 2σ + разбивка по участникам
GET /api/gatherings/<id>/ml-forecast   # ML-оценка (../ml); available:false, если модель не обучена
```

## Прогноз явки

Тонкий роут → сервис [`services/forecast.py`](services/forecast.py): для каждого участника
`p_i = clamp(base(answer)·trust_i·ctx)`, где `trust_i` — доля явок со сглаживанием Лапласа
(α из `ForecastParams`). Прогноз `E = Σ p_i`, интервал `E ± 2σ`. Параметры модели
(`base`, `alpha`, `sigma_k`, границы) хранятся в таблице-синглтоне `ForecastParams` — чтобы
переоценивать их на реальных данных, а не хардкодить.

Обучаемый ML-слой подключён через [`services/attendance_ml.py`](services/attendance_ml.py):
грузит модель из `../ml` один раз и **мягко деградирует** — если ml-зависимостей нет или
модель не обучена, отдаёт `available:false` с подсказкой, а не роняет сервер.

## Надёжность и безопасность

- `validate_config()` не даёт подняться в проде с dev-секретами (защита от подделки JWT).
- `teardown_request` откатывает сессию при исключении — «отравленная» транзакция не ломает
  следующие запросы воркера.
- PII (`phone`) отдаётся **только координатору-владельцу** сбора; `device_id` — только в
  собственном `/me`, никогда в чужих списках.
- Единые JWT-колбэки (истёк / недействителен / отсутствует) и HTTP-error-handlers.

## Миграции

```bash
flask db migrate -m "описание"
flask db upgrade
```
