import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "../server/database";
import { Auth, verifyPassword } from "../server/auth";
import { prepareAdminFile, clearInitialAdminPassword, ADMIN_FILE } from "../server/admin-file";

let base: string, program: string, file: string, db: Database;
beforeEach(() => {
  base = mkdtempSync(resolve(tmpdir(), "lv-admin-file-"));
  program = resolve(base, "app"); mkdirSync(program);
  file = resolve(program, ADMIN_FILE);
  db = new Database(resolve(base, "data"));
});
afterEach(() => { vi.restoreAllMocks(); db.close(); rmSync(base, { recursive: true, force: true }); });
const read = () => JSON.parse(readFileSync(file, "utf8"));
const edit = (changes: Record<string, unknown>) => writeFileSync(file, JSON.stringify({ ...read(), ...changes }), { mode: 0o600 });
const admin = () => db.sql.prepare("SELECT * FROM users WHERE role='admin'").get()!;

it("erstellt automatisch genau ein Konto, ein privates Zufallspasswort und keinen Log mit Geheimnis", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await prepareAdminFile(db, program);
  const data = read(), row = admin();
  expect(data.benutzername).toBe("philipp");
  expect(data.passwort).toMatch(/^[a-zA-Z0-9_-]{32}$/);
  expect(data.aenderungenAnwenden).toBe(false);
  expect(await verifyPassword(data.passwort, String(row.password))).toBe(true);
  expect(JSON.stringify(db.sql.prepare("SELECT * FROM meta").all())).not.toContain(data.passwort);
  expect(JSON.stringify(log.mock.calls)).not.toContain(data.passwort);
  if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
  const raw = readFileSync(file, "utf8");
  await prepareAdminFile(db, program);
  expect(readFileSync(file, "utf8")).toBe(raw);
  expect(db.sql.prepare("SELECT id FROM users").all()).toHaveLength(1);
  expect(admin().password).toBe(row.password);
});

it("entfernt das initiale Klartextpasswort nach der ersten Anmeldung, nicht für einen anderen Benutzer", async () => {
  await prepareAdminFile(db, program);
  const password = read().passwort, row = admin();
  await clearInitialAdminPassword(db, program, "other");
  expect(read().passwort).toBe(password);
  await clearInitialAdminPassword(db, program, String(row.id));
  expect(read().passwort).toBe("");
  await prepareAdminFile(db, program);
  expect(admin().password).toBe(row.password);
  expect(await verifyPassword(password, String(admin().password))).toBe(true);
});

it("übernimmt vorhandenen CLI-Administrator ohne Passwort oder Spielstand zu ändern", async () => {
  const password = randomUUID();
  const id = await new Auth(db).create("betreiber", password, "Besitzer", "Zentrale", undefined, true);
  const old = db.all().get(id)!; old.money = 123456; db.save(id, old);
  const before = admin().password;
  await prepareAdminFile(db, program);
  expect(read().benutzername).toBe("betreiber");
  expect(read().passwort).toBe("");
  expect(admin().password).toBe(before);
  expect(db.all().get(id)).toEqual(old);
});

it("wendet Änderungen nur ausdrücklich an, erhält Besitz und widerruft Sitzungen", async () => {
  await prepareAdminFile(db, program);
  const row = admin(), id = String(row.id), old = db.all().get(id)!;
  old.money = 87654; db.save(id, old);
  const session = new Auth(db).issue(id);
  const password = randomUUID();
  edit({ benutzername: "neuer_admin", anzeigename: "Neuer Name", leitstelle: "Neue Leitstelle", passwort: password });
  await prepareAdminFile(db, program);
  expect(admin().username).toBe("philipp");
  edit({ aenderungenAnwenden: true });
  await prepareAdminFile(db, program);
  expect(admin().id).toBe(id);
  expect(admin().username).toBe("neuer_admin");
  expect(await verifyPassword(password, String(admin().password))).toBe(true);
  expect(db.all().get(id)!.money).toBe(87654);
  expect(db.all().get(id)!.buildings).toEqual(old.buildings);
  expect(db.all().get(id)!.player.station).toBe("Neue Leitstelle");
  expect(new Auth(db).session(`lv_session=${session.value}`)).toBeNull();
  expect(read().passwort).toBe(""); expect(read().aenderungenAnwenden).toBe(false);
  expect(readdirSync(resolve(base, "data/backups")).length).toBeGreaterThan(0);
  const hash = admin().password;
  await prepareAdminFile(db, program);
  expect(admin().password).toBe(hash);
});

it("lässt bei leerem Passwortfeld das bestehende Passwort erhalten", async () => {
  await prepareAdminFile(db, program);
  const hash = admin().password;
  edit({ leitstelle: "Nur umbenannt", passwort: "", aenderungenAnwenden: true });
  await prepareAdminFile(db, program);
  expect(admin().password).toBe(hash);
  expect(db.all().get(String(admin().id))!.player.station).toBe("Nur umbenannt");
});

it("eine gelöschte Konfigurationsdatei erzeugt kein neues Konto und kein neues Passwort", async () => {
  await prepareAdminFile(db, program);
  const row = admin(); rmSync(file);
  await prepareAdminFile(db, program);
  expect(admin()).toEqual(row); expect(read().passwort).toBe("");
  expect(db.sql.prepare("SELECT id FROM users").all()).toHaveLength(1);
});

it("befördert keinen Spieler und lehnt einen belegten Namen ohne Besitzänderung ab", async () => {
  await prepareAdminFile(db, program);
  const auth = new Auth(db), row = admin();
  const player = await auth.create("freund", randomUUID(), "Freund", "Wache", auth.invite(String(row.id)));
  edit({ benutzername: "freund", passwort: randomUUID(), aenderungenAnwenden: true });
  await expect(prepareAdminFile(db, program)).rejects.toThrow("anderen Konto");
  expect(admin()).toEqual(row);
  expect(db.sql.prepare("SELECT role FROM users WHERE id=?").get(player)!.role).toBe("player");
});

it("repariert fehlende Adminrechte nicht durch automatisches Hochstufen eines Spielers", async () => {
  await prepareAdminFile(db, program);
  db.sql.prepare("UPDATE users SET role='player'").run();
  await expect(prepareAdminFile(db, program)).rejects.toThrow("Keine automatische Rechtevergabe");
});

it("verarbeitet einen schon festgeschriebenen Auftrag nach einem Absturz nicht doppelt", async () => {
  await prepareAdminFile(db, program);
  const password = randomUUID();
  edit({ passwort: password, aenderungenAnwenden: true });
  const pending = readFileSync(file, "utf8");
  await prepareAdminFile(db, program);
  const hash = admin().password;
  const audits = db.sql.prepare("SELECT * FROM audit").all().length;
  writeFileSync(file, pending);
  await prepareAdminFile(db, program);
  expect(admin().password).toBe(hash);
  expect(db.sql.prepare("SELECT * FROM audit").all()).toHaveLength(audits);
  expect(read().aenderungenAnwenden).toBe(false);
  expect(read().passwort).toBe("");
});

it("weist geänderte wiederholte Aufträge zurück statt ein Passwort erneut zu setzen", async () => {
  await prepareAdminFile(db, program);
  edit({ passwort: randomUUID(), aenderungenAnwenden: true });
  const pending = read();
  await prepareAdminFile(db, program);
  const hash = admin().password;
  writeFileSync(file, JSON.stringify({ ...pending, passwort: randomUUID() }));
  await expect(prepareAdminFile(db, program)).rejects.toThrow("schon verarbeitet");
  expect(admin().password).toBe(hash);
});

it("ändert bei ungültigem JSON keine Konten", async () => {
  await prepareAdminFile(db, program);
  const row = admin();
  writeFileSync(file, '{"passwort":"geheimes-kaputtes-json"');
  await expect(prepareAdminFile(db, program)).rejects.toThrow("ungültig");
  expect(admin()).toEqual(row);
  expect(readFileSync(file, "utf8")).toContain("geheimes-kaputtes-json");
});

it("übernimmt während der Hashberechnung geänderte Dateien nicht halb", async () => {
  await prepareAdminFile(db, program);
  edit({ passwort: randomUUID(), aenderungenAnwenden: true });
  const row = admin(), pending = prepareAdminFile(db, program);
  edit({ leitstelle: "Parallel bearbeitet" });
  await expect(pending).rejects.toThrow("parallel geändert");
  expect(admin()).toEqual(row);
  expect(read().leitstelle).toBe("Parallel bearbeitet");
});

it("überschreibt keine noch nicht angewendete Passwortänderung bei der Anmeldung", async () => {
  await prepareAdminFile(db, program);
  const password = randomUUID(); edit({ passwort: password, aenderungenAnwenden: true });
  await clearInitialAdminPassword(db, program, String(admin().id));
  expect(read().passwort).toBe(password);
});

it("folgt auf Linux keinem Symlink zur Administratordatei", async () => {
  if (process.platform === "win32") return;
  const target = resolve(base, "secret"); writeFileSync(target, "NICHT ÄNDERN");
  symlinkSync(target, file);
  await expect(prepareAdminFile(db, program)).rejects.toThrow("sicher geöffnet");
  expect(readFileSync(target, "utf8")).toBe("NICHT ÄNDERN");
});

it("weist ältere Sicherungen mit ausstehendem Passwortauftrag zurück", async () => {
  await prepareAdminFile(db, program);
  edit({ passwort: randomUUID(), aenderungenAnwenden: true });
  const old = readFileSync(file, "utf8");
  await prepareAdminFile(db, program);
  edit({ passwort: randomUUID(), aenderungenAnwenden: true });
  await prepareAdminFile(db, program);
  const hash = admin().password;
  writeFileSync(file, old);
  await expect(prepareAdminFile(db, program)).rejects.toThrow("Veralteter Admin-Auftrag");
  expect(admin().password).toBe(hash);
});
