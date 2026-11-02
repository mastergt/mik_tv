BEGIN;
INSERT INTO auth.roles(code,name,system_role) VALUES ('admin','Администратор',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO auth.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM auth.roles r CROSS JOIN auth.permissions p
WHERE r.code='admin' AND p.code NOT IN ('users.read','users.write','roles.write')
ON CONFLICT DO NOTHING;
INSERT INTO core.schema_migrations(version) VALUES ('0013_admin_roles') ON CONFLICT DO NOTHING;
COMMIT;
