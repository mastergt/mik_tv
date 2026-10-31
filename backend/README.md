# IPTV Platform — этап 1: NestJS Admin API

**Версия:** `0.1.0` — backend-каркас и базовый административный API на согласованной PostgreSQL DB v1.

## Что входит

- `database/` — ранее согласованные **неизменённые** миграции `0001`–`0006` (схемы core/auth/catalog/subscribers/epg/messaging/support/vod/audit).
- `backend/` — приложение NestJS (TypeScript), pg Pool, транзакции, административный аудит.
- Локальная авторизация (Argon2id), access JWT (15 минут), refresh-token cookie HttpOnly (30 дней, ротация), отзыв refresh-сессий.
- OIDC code + PKCE + state + nonce + проверка ID-token/JWKS; новый внешний пользователь создаётся `pending` без прав.
- RBAC: разрешения/роли с глобальным уровнем или списком провайдеров. При чтении по ID выполняется проверка области доступа.
- Администраторы: список, создание локального аккаунта, активация `pending`, изменение назначений ролей; защита последнего суперадминистратора.
- Провайдеры: список, карточка, создание и изменение (глобальные права).
- Типы приложений и жанры (отдельные сущности), создание и редактирование.
- Каналы: CRUD, provider visibility (`all` / `selected`), привязка жанров.
- LIVE/DVR-источники: основной/резерв по `priority`, возможные provider-specific URL, CRUD.
- Плейлисты: CRUD, доступность провайдерам, атомарная замена/перестановка списка каналов.
- Ошибки уникальности и ссылочной целостности преобразуются в HTTP 409.
- Пример PM2-конфигурации и nginx reverse proxy.

## Границы этого этапа

Это **только API**, без Angular UI, клиентских API, биллинга, клиентов Android/Web, загрузки EPG, отправки уведомлений, мониторинга URL и фактического ограничения числа сеансов просмотра. Соответствующие **таблицы** уже находятся в DB v1, но worker/backend-модули будут реализованы отдельно.

**Важно:** этот архив пока **не проходил интеграционный прогон с реальным PostgreSQL и npm install/build**: подготовленная среда не имела `psql`/`postgres` и подключения к npm registry. Выполнены статические проверки синтаксиса 20 TypeScript-файлов, структуры таблиц и 4 локальных structural tests. После установки зависимостей нужно запустить `npm run check`, `npm run build` и интеграционный тест. Не используйте сразу на PROD без этого.

## Установка (DEV, Gentoo / другие Linux)

Требуется Node.js **22+**, npm, PostgreSQL **14+**, пользователь БД с правами на создание схем в новой отдельной БД.

1. Распакуйте архив; из каталога `database/` примените миграции:

   ```bash
   createdb iptv_dev
   export DATABASE_URL='postgresql://iptv_admin:YOUR_PASSWORD@127.0.0.1:5432/iptv_dev'
   cd database
   ./scripts/migrate.sh
   ```

   ВАЖНО: `createdb` работает под текущим пользователем PostgreSQL/системы. При необходимости используйте `createdb -O iptv_admin iptv_dev` с правами администратора БД. Роли, БД и доступ в `pg_hba.conf` должны быть подготовлены отдельно.

2. Перейдите в `backend/`, установите зависимости и создайте `.env`:

   ```bash
   cd ../backend
   npm install
   cp .env.example .env
   nano .env
   ```

   Укажите корректный `DATABASE_URL`; для `JWT_SECRET` используйте результат `openssl rand -base64 48`. В DEV установите `COOKIE_SECURE=false`, в PROD `true` (обязательный HTTPS).

3. Создайте **первого** локального суперадминистратора. Команда откажется работать, если в `auth.users` уже существуют пользователи:

   ```bash
   read -rp 'Admin login: ' BOOTSTRAP_ADMIN_USERNAME
   read -rsp 'Admin password: ' BOOTSTRAP_ADMIN_PASSWORD; echo
   export BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
   npm run bootstrap:admin
   unset BOOTSTRAP_ADMIN_PASSWORD
   ```

4. Проверка типов и сборка:

   ```bash
   npm run check
   npm run build
   npm start
   ```

   В DEV `npm run start:dev` запускает TypeScript в режиме `--watch`.

5. Проверка работоспособности:

   ```bash
   curl http://127.0.0.1:13050/api/v1/health
   ```

   Ожидается JSON с `status: ok`. Проверка health не проверяет доступность PostgreSQL; CRUD/вход должны проверяться отдельно.

## Пример административного API

**Вход:**

```bash
curl -sS -c /tmp/iptv-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' \
  http://127.0.0.1:13050/api/v1/auth/login
```

Ответ содержит `access_token` (Bearer, 15 мин). Refresh-токен сохраняется только в HttpOnly cookie. Не сохраняйте access-token в localStorage, предпочтительно держать в памяти Angular-приложения.

```bash
export API='http://127.0.0.1:13050/api/v1'
export TOKEN='PASTE_ACCESS_TOKEN'

curl -H "Authorization: Bearer $TOKEN" "$API/auth/me"
curl -H "Authorization: Bearer $TOKEN" "$API/providers"
curl -H "Authorization: Bearer $TOKEN" "$API/app-types"

curl -X POST "$API/providers" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Мегалинк","slug":"mlink","default_terminal_limit":3,"default_concurrent_stream_limit":2}'

curl -X POST "$API/streams" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"number":101,"name":"Тестовый ТВ","app_type_id":1,"visibility":"all","is_public":false}'

curl -X POST "$API/streams/1/sources" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"source_kind":"live","protocol":"hls","url":"https://tv.example.org/live/101/index.m3u8","priority":10}'

curl -X POST "$API/streams/1/sources" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"source_kind":"dvr","protocol":"hls","url":"https://tv.example.org/dvr/101/{start_unix}/{duration_sec}/index.m3u8","priority":10,"dvr_url_mode":"template"}'

curl -X POST "$API/playlists" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Базовый ТВ","visibility":"selected","provider_ids":[1]}'

curl -X PUT "$API/playlists/1/streams" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"stream_ids":["1"]}'
```

Цифры ID в примерах условные, сначала получите актуальные идентификаторы через GET. `stream_ids` передаются строками, потому что PostgreSQL `bigint` может превышать безопасную точность JavaScript number.

### Список маршрутов

| Метод | Путь относительно `/api/v1` | Право |
|---|---|---|
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | Публичные (refresh cookie) |
| GET | `/auth/oidc/:provider/start`, `/auth/oidc/:provider/callback` | Публичные; проверка OIDC |
| GET | `/auth/me` | Авторизованный сотрудник |
| GET/POST | `/users` | `users.read` / `users.write` (global) |
| GET | `/users/roles`, `/users/:id` | `users.read` (global) |
| PATCH/PUT | `/users/:id/status`, `/users/:id/roles` | `users.write` / `roles.write` (global) |
| GET/POST | `/providers` | `providers.read` / `providers.write` |
| GET/PATCH | `/providers/:id` | `providers.read` / `providers.write` |
| GET/POST/PATCH | `/app-types`, `/app-types/:id` | `streams.read` / `streams.write` |
| GET/POST/PATCH | `/genres`, `/genres/:id` | `genres.read` / `genres.write` |
| GET/POST/PATCH/DELETE | `/streams`, `/streams/:id` | `streams.read` / `streams.write` |
| GET/POST | `/streams/:id/sources` | `sources.read` / `sources.write` |
| PATCH/DELETE | `/sources/:id` | `sources.write` |
| GET/POST/PATCH/DELETE | `/playlists`, `/playlists/:id` | `playlists.read` / `playlists.write` |
| PUT | `/playlists/:id/streams` | `playlists.write` |

### Права по провайдерам

- **Глобальные** каналы и плейлисты: изменяются только с соответствующим глобальным разрешением.
- Ресурсы `visibility=selected`: администратор должен обладать правом для **каждого** связанного провайдера. При изменении списка провайдеров — и старого, и нового набора.
- URL-источники с `provider_id=NULL` изменяются только глобальным `sources.write`; URL конкретного провайдера может менять его администратор, если ему доступен канал.
- Оператор с доступом только к провайдеру №1 при просмотре потоков/плейлистов обязан передать `?providerId=1`. Без фильтра доступ на чтение требуется глобальный. `GET` по ID проверяет область аналогично.
- `playlists` с `visibility=all` допускают только каналы `visibility=all`; в плейлистах выбранных провайдеров каналы проверяются на доступность **каждому** выбранному провайдеру.
- Категории приложений (TV/CCTV/Intercom/Radio) отдельны от жанров. Новые `app-types` можно создавать через API.

## Настройка OIDC

OIDC-провайдеры регистрируются в БД доверенным администратором, а **не** через публичный endpoint. Пример:

```sql
INSERT INTO auth.oauth_providers(code, issuer, client_id, secret_env_name)
VALUES ('corp', 'https://login.example.org/realms/iptv', 'iptv-admin', 'OIDC_CORP_SECRET');
```

В `.env` добавьте `OIDC_CORP_SECRET=...`. Для публичного PKCE-клиента без client secret `secret_env_name=NULL`, если провайдер поддерживает такую конфигурацию. В OIDC-сервисе зарегистрируйте redirect URI вида `https://iptv.example.org/api/v1/auth/oidc/corp/callback`. Поддержана передача client secret через `client_secret_post` (некоторым провайдерам требуется другой способ, который нужно будет добавить).

Пользователь после первого входа появится в `auth.users` со `status='pending'`. Суперадминистратор назначает ему роли через `PUT /users/:id/roles` и активирует через `PATCH /users/:id/status`. Автоматического связывания по email нет.

## PM2 / Nginx

В PROD выполняем `npm run build`, устанавливаем `NODE_ENV=production`, `COOKIE_SECURE=true`, `PUBLIC_API_URL=https://...`, `ADMIN_WEB_URL=https://...` и запускаем:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs iptv-admin-api
```

Приложение слушает `127.0.0.1:13050`, а Nginx принимает TLS. Пример `nginx.example.conf` — это **фрагмент**, который нужно вставить в ваш существующий HTTPS server block. Лимит `limit_req_zone` надо объявить в HTTP-контексте. Не публикуйте порт 13050 напрямую.

Из соображений безопасности для PROD дополнительно нужны: rate limiting на всех auth endpoints, CSRF/Origin контроль для cookie-based операций, централизованный мониторинг ошибок, интеграционные тесты, логирование без токенов/паролей, ротация ключей и настоящие миграции по мере развития проекта.

## План следующего этапа

**Angular-админка**: экран входа, выбор провайдера, таблицы каналов, редактирование LIVE/DVR-источников, каталог плейлистов, drag-and-drop сортировка. Затем API абонентов, терминалов, лимитов и EPG.
