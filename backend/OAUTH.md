# Вход через Google

Erik поддерживает Google OAuth 2.0 / OpenID Connect через Authlib. Вход по паролю
продолжает работать. Шаблон `Desktop/backend` отсылает к реализации FoodTrack;
в Erik используется её разделение на routes/service с проверкой OIDC и отдельным
обменом одноразового кода на существующую пару JWT.

## Настройка

1. В Google Cloud Console настройте OAuth consent screen и создайте OAuth client
   типа **Web application**. Для режима Testing добавьте нужные Google-аккаунты
   в Test users.
2. В **Authorized redirect URIs** добавьте точный публичный адрес backend callback:
   `https://<домен-api>/api/auth/oauth/google/callback`.
   Для локальной разработки: `http://localhost:5000/api/auth/oauth/google/callback`.
   Это серверный маршрут, не React-страница `/oauth/callback`.
3. Добавьте в существующий `backend/.env`, сохранив остальные настройки:

   ```dotenv
   GOOGLE_CLIENT_ID=<client-id>
   GOOGLE_CLIENT_SECRET=<client-secret>
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/oauth/google/callback
   FRONTEND_URL=http://localhost:3000
   ```

   На сервере используйте HTTPS-адреса backend и frontend. `FRONTEND_URL` должен
   указывать на тот же origin, где пользователь нажимает кнопку Google: браузер
   хранит подтверждение входа в `sessionStorage` этой вкладки. `localhost` и
   `127.0.0.1` — разные origin. Добавьте origin фронтенда в `CORS_ORIGINS`.
   Секрет Google хранится только на backend. Во frontend `.env` он не нужен.
4. Установите зависимости и примените миграцию в нужном окружении:

   ```bash
   cd backend
   python -m pip install -r requirements.txt
   flask --app app db-sync
   ```

   Миграция `a3b4c5d6e7f8` добавляет `oauth_identities` и `oauth_login_codes`.
   Существующие строки пользователей не изменяются. Перед обновлением production
   сохраните резервную копию по [DEPLOYMENT.md](DEPLOYMENT.md). Docker entrypoint
   уже запускает `db-sync`. Сохраните текущие имена Compose, БД и volumes.
5. Перезапустите backend и соберите frontend обычным способом. Сервер фронтенда
   должен отдавать React-приложение для `/oauth/callback`, как для других SPA routes.
   Кнопка «Продолжить с Google» появляется на входе и регистрации только при
   заполненных `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Поведение

- Новый пользователь подтверждает фамилию и имя, четыре согласия текущей редакции
  документов; только после этого создаются профиль волонтёра и запись LegalConsent.
  Google не выдаёт роль координатора, НКО или администратора.
- Если email уже занят, для первой привязки требуется пароль этого аккаунта.
  Сохраняются его ID, роль, история и показатели; прежние JWT отзываются.
  Автоматического объединения по email нет. Аккаунт без пароля с таким email
  автоматически не связывается; сначала требуется прежний способ входа.
- Повторный вход определяется по Google `sub`, а не по изменяемому email.
  Заблокированный аккаунт войти не может.
- Отдельные device-профили автоматически не объединяются с Google-профилем.
  Созданный OAuth-профиль считается аккаунтом и недоступен для device-входа.
- При необходимости добавить пароль OAuth-пользователь может пройти существующее
  восстановление пароля по email, если SMTP настроен.
- Ссылки приглашений и подтверждения явки сохраняются после входа. Запускать и
  завершать вход нужно в одной вкладке. Последний запуск заменяет незавершённый.

## API и защита

| Метод и маршрут | Назначение |
| --- | --- |
| `GET /api/auth/oauth/providers` | `{ "providers": ["google"] }` либо пустой список |
| `GET /api/auth/oauth/google/start?challenge=…` | Навигация браузера; SHA-256 challenge от случайного verifier; redirect в Google |
| `GET /api/auth/oauth/google/callback` | Callback Google, проверка OIDC, redirect в фиксированный frontend |
| `POST /api/auth/oauth/exchange` | JSON `{code, verifier}`; готовая сессия либо `registration_required` / `link_required` |

Для регистрации повторите exchange с `full_name` и `legal` (тот же формат, что
у `/api/auth/register`); для привязки — с `password`. Готовый ответ содержит
`user`, `access_token`, `refresh_token` в формате существующего входа по паролю.

Authlib проверяет state, nonce, подпись ID token, issuer, audience и expiry;
используется PKCE S256. Google email должен быть подтверждён. HttpOnly cookie
с SameSite=Lax связывает начало и callback; в production она Secure.

В URL фронтенда передаётся только случайный одноразовый код во fragment. Для
обмена дополнительно нужен verifier из исходной вкладки. JWT и токены Google
в URL не передаются; токены Google не сохраняются в БД. Код действует 10 минут,
успешный обмен атомарно удаляет его. Просроченные записи очищаются при следующих
успешных callback. Ответы OAuth имеют `Cache-Control: no-store` и
`Referrer-Policy: no-referrer`.

Ссылки на протокол и библиотеку:
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[Authlib Flask](https://docs.authlib.org/en/latest/client/flask.html).

## Проверка

`pytest tests/test_oauth.py tests/test_security_migration.py tests/test_schema_state.py`
проверяет OIDC с локально подписанными ID tokens, ошибки claims/state, выдачу JWT,
согласия, привязку, запрет входа заблокированным пользователям, одноразовость кода
и обновление существующей SQLite-схемы. Это не заменяет реальный вход в Google
с настроенным OAuth client и проверку production PostgreSQL/HTTPS/proxy.
