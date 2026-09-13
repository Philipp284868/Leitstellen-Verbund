-- Domain migration, conflict report and original-data backup are performed by the
-- packaged server before activation. No arbitrary ownership/refund decisions in SQL.
INSERT INTO meta(key,value) SELECT 'infrastructure-source-schema',CAST(user_version AS TEXT) FROM pragma_user_version WHERE true ON CONFLICT(key) DO NOTHING;
