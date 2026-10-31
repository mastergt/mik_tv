# IPTV: ER-модель v1.0

Здесь показаны основные связи. В полной БД есть дополнительные поля аудита, настройка доступа, вспомогательные индексы и связи, которые описаны в миграциях.

## Каталог, права администраторов, провайдеры

```mermaid
erDiagram
    PROVIDERS ||--o{ STREAM_PROVIDERS : scope
    PROVIDERS ||--o{ PLAYLIST_PROVIDERS : scope
    PROVIDERS ||--o{ GENRE_PROVIDERS : scope
    PROVIDERS ||--o{ STREAM_PROVIDER_OVERRIDES : customizes
    PROVIDERS ||--o{ STREAM_SOURCES : overrides_url
    PROVIDERS ||--o{ USER_ROLE_ASSIGNMENTS : role_scope
    USERS ||--o{ USER_ROLE_ASSIGNMENTS : obtains
    USERS ||--o{ EXTERNAL_IDENTITIES : sign_in
    OAUTH_PROVIDERS ||--o{ EXTERNAL_IDENTITIES : issues
    ROLES ||--o{ USER_ROLE_ASSIGNMENTS : assigned
    ROLES ||--o{ ROLE_PERMISSIONS : permits
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : included
    APP_TYPES ||--o{ STREAMS : mode
    STREAMS ||--o{ STREAM_PROVIDERS : available_to
    STREAMS ||--o{ STREAM_PROVIDER_OVERRIDES : branded_as
    STREAMS ||--o{ STREAM_SOURCES : live_or_dvr
    STREAM_SOURCES ||--o| SOURCE_HEALTH : current_status
    STREAM_SOURCES ||--o{ SOURCE_HEALTH_EVENTS : transitions
    STREAMS ||--o{ STREAM_GENRES : classified
    GENRES ||--o{ STREAM_GENRES : classifies
    GENRES ||--o{ GENRE_PROVIDERS : available_to
    PLAYLISTS ||--o{ PLAYLIST_PROVIDERS : available_to
    PLAYLISTS ||--o{ PLAYLIST_STREAMS : contains
    STREAMS ||--o{ PLAYLIST_STREAMS : included
```

## Абоненты, устройства, доступы

```mermaid
erDiagram
    PROVIDERS ||--o{ ABONENTS : serves
    ABONENTS ||--o{ ABONENT_PLAYLISTS : granted
    PLAYLISTS ||--o{ ABONENT_PLAYLISTS : assigned
    ABONENTS ||--o{ ABONENT_STREAMS : granted
    STREAMS ||--o{ ABONENT_STREAMS : assigned
    ABONENTS ||--o{ TERMINALS : binds
    TERMINALS ||--o{ TERMINAL_SESSIONS : connects
    TERMINALS ||--o{ PLAYBACK_SESSIONS : plays
    STREAMS ||--o{ PLAYBACK_SESSIONS : watched
    ABONENTS ||--o| PARENTAL_SETTINGS : filters
    TERMINALS ||--o| TERMINAL_SETTINGS : configured
    TERMINALS ||--o{ TERMINAL_FAVORITES : stores
    STREAMS ||--o{ TERMINAL_FAVORITES : favored
```

## EPG, сообщения, аудит

```mermaid
erDiagram
    EPG_SOURCES ||--o{ EPG_CHANNELS : provides
    EPG_SOURCES ||--o{ EPG_IMPORT_JOBS : fetched
    EPG_SOURCES ||--o{ EPG_SOURCE_PROVIDERS : available_to
    EPG_CHANNELS ||--o{ EPG_PROGRAMMES : broadcasts
    EPG_CHANNELS ||--o{ EPG_STREAM_MAPPINGS : matched_to
    STREAMS ||--o{ EPG_STREAM_MAPPINGS : programme_source
    MESSAGES ||--o{ AUDIENCES : directed_to
    MESSAGES ||--o{ SCHEDULES : planned
    MESSAGES ||--o{ DISPATCHES : sent
    SCHEDULES ||--o{ DISPATCHES : fired
    DISPATCHES ||--o{ DELIVERIES : tracks
    ABONENTS ||--o{ DELIVERIES : receives
    TERMINALS ||--o{ DELIVERIES : shows
    USERS ||--o{ AUDIT_EVENTS : changes
```

### Правила доступа

- `visibility = 'all'`: ресурс доступен провайдерам; таблица связей для него не используется.
- `visibility = 'selected'`: ресурс доступен только провайдерам из `*_providers`. Если связей нет, ресурс не доступен никому (fail closed).
- Привязка плейлиста к абоненту не позволяет смотреть канал, который запрещён провайдеру; в клиентском каталоге используются пересечения всех прав.
- `playlist.is_public` означает видимость бесплатной публичной подборки. Доступ анонимного клиента к конкретному видео требует `streams.is_public = true`, `streams.enabled = true` и доступности потока провайдеру. Плейлист не снимает это ограничение.
- Права подписчика: действующий прямой `abonent_streams` ИЛИ включение в действующий `abonent_playlists` плюс ограничения канала, провайдера и родительского контроля.
- `is_hidden` влияет на поисковую выдачу, не отменяет выданных прав.
- Подробные сессии просмотров отключаемы независимо от количества допустимых параллельных просмотров.
