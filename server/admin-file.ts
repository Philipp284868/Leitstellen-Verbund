import {
  constants, openSync, closeSync, fstatSync, fchmodSync, readFileSync,
  writeFileSync, fsyncSync, renameSync, unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./database";
import { usernameSchema, passwordSchema, passwordHash, verifyPassword } from "./auth";
import { fresh } from "../src/model";

const KEY = "amp-admin-file-v1";
export const ADMIN_FILE = "admin-konto.json";
const label = z.string().trim().min(1).max(48);
const fileSchema = z.object({
  version: z.literal(1),
  auftrag: z.string().uuid(),
  benutzername: usernameSchema,
  anzeigename: label,
  leitstelle: label,
  passwort: z.union([z.literal(""), passwordSchema]),
  aenderungenAnwenden: z.boolean(),
  status: z.string().max(500),
}).strict();
type AdminFile = z.infer<typeof fileSchema>;
const stateSchema = z.object({
  userId: z.string().min(1),
  lastRequest: z.string(),
  nextRequest: z.string(),
  created: z.boolean(),
  showInitialPassword: z.boolean(),
}).strict();
type State = z.infer<typeof stateSchema>;

// Read only a small regular file owned by the application user. Never follow symlinks or block on a FIFO.
function readPrivate(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw Error("admin-konto.json kann nicht sicher geöffnet werden (Rechte/Symlink prüfen).");
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384 || stat.nlink !== 1 ||
        (process.getuid && stat.uid !== process.getuid()))
      throw Error("admin-konto.json muss eine eigene reguläre Datei unter 16 KiB sein.");
    if (process.platform !== "win32") fchmodSync(fd, 0o600);
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
function parseFile(raw: string): AdminFile {
  try { return fileSchema.parse(JSON.parse(raw)); }
  catch { throw Error("admin-konto.json ist ungültig. JSON, Felder und Passwortlänge (12–128) prüfen; keine Daten gelöscht."); }
}
// Synchronous compare/write avoids overwriting an edit made while password hashing or backup ran.
function writePrivate(path: string, value: AdminFile, expected: string | null) {
  if (readPrivate(path) !== expected)
    throw Error("admin-konto.json wurde während der Einrichtung geändert. Server gestoppt lassen und erneut starten.");
  const output = JSON.stringify(value, null, 2) + "\n";
  const temp = `${path}.${randomUUID()}.tmp`;
  const target = expected === null ? path : temp;
  const fd = openSync(target, "wx", 0o600);
  try { writeFileSync(fd, output, "utf8"); fsyncSync(fd); }
  finally { closeSync(fd); }
  if (expected !== null) {
    try {
      if (readPrivate(path) !== expected) throw Error("Admin-Datei parallel geändert. Erneut starten.");
      renameSync(temp, path);
    } finally {
      try { unlinkSync(temp); } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }
}
function state(db: Database): State | null {
  const row = db.sql.prepare("SELECT value FROM meta WHERE key=?").get(KEY);
  if (!row) return null;
  try { return stateSchema.parse(JSON.parse(String(row.value))); }
  catch { throw Error("Admin-Einrichtungsstatus ungültig. Datenbank nicht löschen."); }
}
function saveState(db: Database, value: State) {
  db.sql.prepare("INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(KEY, JSON.stringify(value));
}
function selectAdmin(db: Database, prior: State | null, username = "philipp") {
  if (prior) {
    const row = db.sql.prepare("SELECT id,username,password FROM users WHERE id=? AND role='admin'").get(prior.userId);
    if (!row) throw Error("Zugeordnetes Administratorkonto fehlt. Keine automatische Rechtevergabe.");
    return row;
  }
  const rows = db.sql.prepare("SELECT id,username,password FROM users WHERE role='admin' ORDER BY created,id").all();
  if (rows.length === 1) return rows[0];
  const chosen = rows.find((row) => row.username === username);
  if (chosen) return chosen;
  if (db.sql.prepare("SELECT id FROM users LIMIT 1").get())
    throw Error("Administratorkonto nicht eindeutig. In admin-konto.json den vorhandenen Admin-Benutzernamen wählen; Spieler werden nicht befördert.");
  return null;
}

/** Called under the existing server process lock, before the listening socket is opened. */
export async function prepareAdminFile(db: Database, directory: string) {
  const path = resolve(directory, ADMIN_FILE);
  let prior = state(db);
  let raw = readPrivate(path);
  if (raw === null) {
    const admin = selectAdmin(db, prior);
    const save = admin ? db.all().get(String(admin.id)) : null;
    const file: AdminFile = {
      version: 1, auftrag: prior?.nextRequest || randomUUID(),
      benutzername: admin ? String(admin.username) : "philipp",
      anzeigename: save?.player.name || "Philipp",
      leitstelle: save?.player.station || "Leitstelle Philipp",
      passwort: admin ? "" : randomBytes(24).toString("base64url"),
      aenderungenAnwenden: !admin,
      status: admin ? "Vorhandenes Konto bleibt unverändert. Für Änderungen Felder bearbeiten und aenderungenAnwenden auf true setzen." : "Ersteinrichtung wird beim Serverstart ausgeführt.",
    };
    writePrivate(path, file, null);
    raw = readPrivate(path)!;
  }
  const file = parseFile(raw);
  if (prior && file.aenderungenAnwenden && file.auftrag !== prior.nextRequest && file.auftrag !== prior.lastRequest)
    throw Error("Veralteter Admin-Auftrag. Keine Änderung ausgeführt; aktuelle Datei statt alter Sicherung verwenden.");
  const admin = selectAdmin(db, prior, file.benutzername);
  if (admin && !prior) {
    prior = { userId: String(admin.id), lastRequest: "", nextRequest: file.auftrag, created: false, showInitialPassword: false };
    saveState(db, prior);
  }
  if (admin && !file.aenderungenAnwenden && prior?.lastRequest !== file.auftrag) return;
  if (!admin && !file.passwort)
    throw Error("Für die Ersteinrichtung in admin-konto.json ein Passwort mit mindestens 12 Zeichen eintragen.");

  // A database commit may have succeeded just before a power loss prevented file acknowledgement.
  // Never replay that password change; no fast password fingerprint is stored beside the scrypt hash.
  if (prior?.lastRequest === file.auftrag) {
    const current = db.all().get(prior.userId)!;
    if (!admin || admin.username !== file.benutzername || current.player.name !== file.anzeigename ||
        current.player.station !== file.leitstelle ||
        (file.passwort && !(await verifyPassword(file.passwort, String(admin.password)))))
      throw Error("Dieser Admin-Auftrag wurde schon verarbeitet, die Datei aber nachträglich geändert. Keine erneute Passwortänderung ausgeführt.");
  } else {
    const encoded = file.passwort ? await passwordHash(file.passwort) : null;
    if (admin) await db.backup();
    if (readPrivate(path) !== raw) throw Error("Admin-Datei parallel geändert. Erneut starten.");
    const next: State = {
      userId: admin ? String(admin.id) : "",
      lastRequest: file.auftrag, nextRequest: randomUUID(),
      created: !admin, showInitialPassword: !admin,
    };
    db.transaction(() => {
      const occupied = db.sql.prepare("SELECT id FROM users WHERE username=?").get(file.benutzername);
      if (occupied && String(occupied.id) !== next.userId)
        throw Error("Gewünschter Benutzername gehört bereits einem anderen Konto.");
      if (admin) {
        const current = db.all().get(next.userId);
        if (!current) throw Error("Spielstand des Administrators fehlt.");
        current.player.name = file.anzeigename;
        current.player.station = file.leitstelle;
        current.revision++;
        db.save(next.userId, current);
        db.sql.prepare("UPDATE users SET username=?,password=COALESCE(?,password) WHERE id=? AND role='admin'")
          .run(file.benutzername, encoded, next.userId);
        db.sql.prepare("DELETE FROM sessions WHERE user_id=?").run(next.userId);
      } else {
        if (db.sql.prepare("SELECT id FROM users LIMIT 1").get()) throw Error("Ersteinrichtung ist bereits abgeschlossen.");
        const save = fresh(file.anzeigename, file.leitstelle, Date.now() / 1000);
        next.userId = save.player.id;
        db.sql.prepare("INSERT INTO users VALUES (?,?,?,?,?)")
          .run(next.userId, file.benutzername, encoded!, "admin", Date.now());
        db.save(next.userId, save);
      }
      saveState(db, next);
      db.audit(next.userId, admin ? "amp-admin-file-updated" : "amp-admin-file-created");
    });
    prior = next;
  }
  writePrivate(path, {
    ...file, auftrag: prior!.nextRequest, aenderungenAnwenden: false,
    passwort: prior!.showInitialPassword ? file.passwort : "",
    status: prior!.showInitialPassword
      ? "Konto erstellt. Mit benutzername und passwort anmelden. Das Startpasswort wird nach der ersten erfolgreichen Anmeldung aus dieser Datei entfernt."
      : "Änderungen übernommen. Passwortfeld aus Sicherheitsgründen geleert; Konto und Spielstand bleiben erhalten.",
  }, raw);
  console.log("Admin-Einrichtung abgeschlossen. Einstellungen stehen privat im AMP-Dateimanager in admin-konto.json (keine Passwortausgabe im Log).");
}

/** Best effort only: a file problem must not block an otherwise valid login. */
export async function clearInitialAdminPassword(db: Database, directory: string, userId: string) {
  try {
    const prior = state(db);
    if (!prior?.showInitialPassword || prior.userId !== userId) return;
    const path = resolve(directory, ADMIN_FILE), raw = readPrivate(path);
    if (raw === null) return;
    const file = parseFile(raw);
    if (file.aenderungenAnwenden || file.auftrag !== prior.nextRequest) return;
    const admin = db.sql.prepare("SELECT password FROM users WHERE id=? AND role='admin'").get(userId);
    if (!admin || (file.passwort && !(await verifyPassword(file.passwort, String(admin.password))))) return;
    writePrivate(path, { ...file, passwort: "", status: "Anmeldung erfolgreich. Für spätere Änderungen passwort neu eintragen, aenderungenAnwenden auf true setzen und den Server neu starten." }, raw);
    saveState(db, { ...prior, showInitialPassword: false });
  } catch {
    console.warn("Startpasswort konnte nicht aus admin-konto.json entfernt werden. Datei privat im AMP-Dateimanager prüfen; Anmeldung bleibt gültig.");
  }
}
