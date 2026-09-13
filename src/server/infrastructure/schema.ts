/** World-scoped tables live in the same SQLite transaction as saves and command receipts. */
export const INFRASTRUCTURE_SCHEMA = `
CREATE TABLE IF NOT EXISTS infrastructure_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO infrastructure_state(id) VALUES(1);
CREATE TABLE IF NOT EXISTS station_ownership(
  facility TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id),
  building TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind<>'hospital'),
  purchased_at REAL,
  receipt TEXT,
  UNIQUE(owner,building)
);
CREATE TABLE IF NOT EXISTS station_aliases(
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  facility TEXT NOT NULL REFERENCES station_ownership(facility) ON DELETE CASCADE,
  PRIMARY KEY(source,kind)
);
CREATE TABLE IF NOT EXISTS clinic_places(
  patient TEXT PRIMARY KEY,
  clinic TEXT NOT NULL,
  owner TEXT REFERENCES users(id),
  mission TEXT NOT NULL,
  transport TEXT NOT NULL,
  departments TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN('reserved','occupied','discharged','cancelled')),
  created REAL NOT NULL,
  admitted REAL,
  discharge REAL,
  revision INTEGER NOT NULL,
  CHECK(state<>'occupied' OR admitted IS NOT NULL AND discharge IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS clinic_places_capacity ON clinic_places(clinic,state);
CREATE INDEX IF NOT EXISTS clinic_places_transport ON clinic_places(owner,transport,state);
CREATE INDEX IF NOT EXISTS clinic_places_discharge ON clinic_places(state,discharge);
CREATE TABLE IF NOT EXISTS infrastructure_refunds(
  id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),building TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>=0),evidence TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS water_flow(source TEXT PRIMARY KEY,at REAL NOT NULL,litres REAL NOT NULL CHECK(litres>=0));
CREATE TABLE IF NOT EXISTS water_consumers(source TEXT NOT NULL,consumer TEXT NOT NULL,at REAL NOT NULL,litres REAL NOT NULL,PRIMARY KEY(source,consumer));
`;
