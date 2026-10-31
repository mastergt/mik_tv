BEGIN;

INSERT INTO catalog.app_types(code, name, ui_config) VALUES
  ('tv', 'Телевидение', '{"epg":true,"dvr":true,"fullscreen":true}'::jsonb),
  ('cctv', 'Видеонаблюдение', '{"epg":false,"dvr":true,"fullscreen":true}'::jsonb),
  ('intercom', 'Домофония', '{"epg":false,"dvr":false,"fullscreen":true}'::jsonb),
  ('radio', 'Радио', '{"epg":true,"dvr":false,"fullscreen":false}'::jsonb);

INSERT INTO auth.permissions(code, description) VALUES
  ('providers.read', 'Просмотр провайдеров'),
  ('providers.write', 'Редактирование провайдеров'),
  ('streams.read', 'Просмотр каналов'),
  ('streams.write', 'Редактирование каналов'),
  ('sources.read', 'Просмотр URL и источников вещания'),
  ('sources.write', 'Редактирование URL и источников вещания'),
  ('playlists.read', 'Просмотр плейлистов'),
  ('playlists.write', 'Редактирование плейлистов'),
  ('genres.read', 'Просмотр жанров'),
  ('genres.write', 'Редактирование жанров'),
  ('abonents.read', 'Просмотр абонентов'),
  ('abonents.write', 'Редактирование абонентов'),
  ('abonents.credentials.read', 'Расшифровка пароля абонента с аудитом'),
  ('terminals.read', 'Просмотр терминалов'),
  ('terminals.write', 'Редактирование терминалов'),
  ('playback.read', 'Просмотр статистики воспроизведения'),
  ('epg.read', 'Просмотр телепрограммы'),
  ('epg.write', 'Управление источниками и сопоставлениями EPG'),
  ('messages.read', 'Просмотр сообщений'),
  ('messages.write', 'Создание и изменение сообщений'),
  ('messages.send', 'Запуск рассылки'),
  ('audit.read', 'Просмотр журнала аудита'),
  ('users.read', 'Просмотр административных пользователей'),
  ('users.write', 'Изменение административных пользователей'),
  ('roles.write', 'Управление назначением прав'),
  ('settings.read', 'Просмотр системных настроек'),
  ('settings.write', 'Изменение системных настроек'),
  ('monitoring.read', 'Просмотр статуса потоков'),
  ('monitoring.write', 'Управление проверками потоков');

INSERT INTO auth.roles(code, name, system_role) VALUES
  ('superadmin', 'Суперадминистратор', true),
  ('provider_admin', 'Администратор провайдера', true),
  ('operator', 'Оператор', true),
  ('support', 'Техническая поддержка', true),
  ('viewer', 'Только просмотр', true);

INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r CROSS JOIN auth.permissions p
WHERE r.code = 'superadmin';

INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r JOIN auth.permissions p ON p.code IN (
  'streams.read', 'streams.write', 'sources.read', 'sources.write',
  'playlists.read', 'playlists.write', 'genres.read', 'genres.write',
  'abonents.read', 'abonents.write', 'terminals.read', 'terminals.write',
  'playback.read', 'epg.read', 'epg.write', 'messages.read', 'messages.write',
  'messages.send', 'monitoring.read', 'monitoring.write', 'providers.read'
)
WHERE r.code = 'provider_admin';

INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r JOIN auth.permissions p ON p.code IN (
  'streams.read', 'sources.read', 'playlists.read', 'abonents.read', 'abonents.write',
  'terminals.read', 'terminals.write', 'epg.read', 'messages.read', 'messages.write',
  'messages.send', 'monitoring.read', 'playback.read'
) WHERE r.code = 'operator';

INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r JOIN auth.permissions p ON p.code IN (
  'streams.read', 'sources.read', 'playlists.read', 'abonents.read',
  'terminals.read', 'playback.read', 'epg.read', 'monitoring.read'
) WHERE r.code = 'support';

INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r JOIN auth.permissions p ON p.code IN (
  'streams.read', 'playlists.read', 'abonents.read', 'terminals.read',
  'epg.read', 'messages.read'
) WHERE r.code = 'viewer';

INSERT INTO core.system_settings(key, value) VALUES
  ('discovery', '{"protocol_version":1,"fallback_base_url":"https://iptv.point.artelmik.ru"}'::jsonb),
  ('playback', '{"lease_ttl_seconds":90,"heartbeat_seconds":30,"history_enabled_default":false}'::jsonb),
  ('epg', '{"retention_past_days":7,"max_download_mb":250}'::jsonb),
  ('messaging', '{"poll_fallback_seconds":60,"delivery_retention_days":30}'::jsonb);

INSERT INTO core.schema_migrations(version) VALUES ('0006_seeds');
COMMIT;
