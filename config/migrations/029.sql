-- The packaged server performs the backed, catalog-aware profile/identity
-- migration before player admission. Raising the storage schema alone must not
-- mark that domain migration complete.
INSERT INTO meta(key,value) SELECT 'fire-profiles-source-schema',CAST(user_version AS TEXT) FROM pragma_user_version WHERE true ON CONFLICT(key) DO NOTHING;
