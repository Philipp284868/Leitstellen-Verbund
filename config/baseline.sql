-- Empty Germany world, schema 26. No accounts, sessions, history or ownership.
CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role='player'), created INTEGER NOT NULL);
CREATE TABLE saves(user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
CREATE TABLE sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE actions(user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE rewards(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL);
CREATE TABLE limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL);
CREATE TRIGGER player_role_insert BEFORE INSERT ON users
              WHEN NEW.role <> 'player' BEGIN SELECT RAISE(ABORT, 'Nur Spielerkonten erlaubt'); END;
CREATE TRIGGER player_role_update BEFORE UPDATE OF role ON users
              WHEN NEW.role <> 'player' BEGIN SELECT RAISE(ABORT, 'Nur Spielerkonten erlaubt'); END;
CREATE TABLE solo_saves(user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
CREATE TABLE desk_members(user_id TEXT PRIMARY KEY REFERENCES users(id), owner_id TEXT NOT NULL REFERENCES users(id), CHECK(user_id<>owner_id));
CREATE TABLE desk_invites(user_id TEXT REFERENCES users(id),owner_id TEXT REFERENCES users(id),PRIMARY KEY(user_id,owner_id),CHECK(user_id<>owner_id));
CREATE TABLE mission_history (
  owner TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, id TEXT NOT NULL,
  completed REAL NOT NULL, org TEXT NOT NULL, major INTEGER NOT NULL, search TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY(owner,mode,id));
CREATE TABLE tutorial_progress(user_id TEXT PRIMARY KEY REFERENCES users(id),payload TEXT NOT NULL);
CREATE TABLE training_worlds(user_id TEXT PRIMARY KEY REFERENCES users(id),payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE facility_rights(owner TEXT NOT NULL REFERENCES users(id),facility TEXT NOT NULL,building TEXT NOT NULL,identity TEXT NOT NULL,PRIMARY KEY(owner,facility),UNIQUE(owner,building));
CREATE TABLE game_events(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,at REAL NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,id));
CREATE TABLE event_cursors(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,xp INTEGER NOT NULL);
CREATE TABLE player_metrics(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, xp INTEGER NOT NULL, legacy_xp INTEGER NOT NULL, calls INTEGER NOT NULL DEFAULT 0, participations INTEGER NOT NULL DEFAULT 0, active_seconds REAL NOT NULL DEFAULT 0, excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN(0,1)));
CREATE TABLE player_activity(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, generation TEXT NOT NULL, mission TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(owner,generation,mission,kind,event));
CREATE TABLE ranked_missions(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,generation TEXT NOT NULL,mission TEXT NOT NULL,PRIMARY KEY(owner,generation,mission));
CREATE TABLE desk_metrics(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE TABLE bug_reports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,issue INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX history_order ON mission_history(owner,mode,completed DESC,id DESC);
CREATE INDEX game_events_page ON game_events(owner,at DESC,id DESC);
CREATE INDEX player_rank ON player_metrics(excluded,xp DESC,user_id);
CREATE INDEX report_owner ON bug_reports(owner,created);
CREATE TABLE game_operators(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, granted_at INTEGER NOT NULL);
PRAGMA user_version=26;
