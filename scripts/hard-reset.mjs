/** Explicit, offline, one-use maintenance only. Never imported by the game or setup. */
import {
  accessSync, constants, closeSync, fstatSync, fsyncSync, lstatSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync,
  rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const sqliteSuffix = '\\.sqlite(?:-wal|-shm|-journal)?';
const generatedBackup = new RegExp(`^game-[0-9]{10,17}-${uuid}${sqliteSuffix}$`, 'i');
const migrationCopy = new RegExp(`^pre-migration-(?:v2-)?[0-9]{10,17}(?:-${uuid})?${sqliteSuffix}$`, 'i');
const restoreCopy = new RegExp(`^restore-${uuid}${sqliteSuffix}$`, 'i');
export const OBSOLETE_FILES = ['admin-konto.json', 'ADMIN-ZUGANG.txt', 'amp-admin-einrichten.mjs'];
const databaseFiles = new Set(['game.sqlite', 'game.sqlite-wal', 'game.sqlite-shm', 'game.sqlite-journal']);

function metadata(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(path) {
  const info = metadata(path);
  if (!info?.isDirectory() || info.isSymbolicLink())
    throw Error(`Kein echtes Verzeichnis (oder Symlink): ${path}`);
  accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK);
  return info;
}
function sameFile(a, b) {
  return !!a && !!b && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeMs === b.mtimeMs;
}
function regular(path) {
  const info = metadata(path);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw Error(`Unsicherer Dateityp/Verknüpfung; nichts an dieser Datei löschen: ${path}`);
  return info;
}
function readSmall(path) {
  const info = regular(path);
  if (!info) return null;
  if (info.size > 16384) throw Error(`Wartungsdatei zu groß: ${path}`);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(info, fstatSync(fd))) throw Error('Datei während der Prüfung geändert.');
    return { text: readFileSync(fd, 'utf8'), info };
  } finally { closeSync(fd); }
}
function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY || 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function createPrivate(path, content) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(content, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
function parseRecord(raw, label) {
  try { return JSON.parse(raw.text); }
  catch { throw Error(`${label} ist beschädigt. Keine automatische Freigabe.`); }
}
function outside(a, b) {
  const part = relative(a, b);
  return part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part);
}
function lockData(dataDir) {
  const path = resolve(dataDir, 'server.lock');
  const previous = readSmall(path);
  if (previous) {
    const record = parseRecord(previous, 'Prozess-Lock');
    if (!Number.isSafeInteger(record.pid) || record.pid <= 0)
      throw Error('Prozess-Lock ungültig. Nicht automatisch löschen.');
    let dead = false;
    try { process.kill(record.pid, 0); }
    catch (error) { dead = error.code === 'ESRCH'; }
    if (!dead) throw Error('Prozess existiert noch oder Berechtigung unklar. Reset abgebrochen; Spiel zuerst stoppen.');
    const current = readSmall(path);
    if (!current || current.text !== previous.text || !sameFile(current.info, previous.info))
      throw Error('Prozess-Lock wurde geändert. Reset abgebrochen.');
    unlinkSync(path);
    syncDirectory(dataDir);
  }
  createPrivate(path, { pid: process.pid, started: new Date().toISOString(), maintenance: 'hard-reset' });
  const owned = readSmall(path);
  const assertOwned = () => {
    const current = readSmall(path);
    if (!current || current.text !== owned.text || !sameFile(current.info, owned.info))
      throw Error('Wartungssperre verändert. Vorgang abgebrochen.');
  };
  return {
    assertOwned,
    release() { assertOwned(); unlinkSync(path); syncDirectory(dataDir); },
  };
}

/** Deletes ONLY listed application files, never a data directory recursively. */
export function hardReset({ programDir, dataDir, requestId, confirmed = false }) {
  if (!confirmed) throw Error('Bestätigung --confirm-delete-all-player-data fehlt. Keine Daten gelöscht.');
  if (!/^[a-z0-9][a-z0-9_-]{3,63}$/.test(requestId || ''))
    throw Error('--request benötigt eine eindeutige Kennung aus 4–64 Kleinbuchstaben/Ziffern/_/-.');
  const app = realpathSync(programDir), requestedData = resolve(dataDir);
  directory(app);
  directory(requestedData);
  const data = realpathSync(requestedData);
  // Both directions matter: DATA_DIR may be neither the app nor its parent nor its child.
  if (!outside(app, data) || !outside(data, app) || dirname(data) === data)
    throw Error('Daten- und Programmordner müssen getrennt sein; kein Wurzel-/übergeordneter Ordner.');
  if (JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8')).name !== 'leitstellen-verbund')
    throw Error('Kein Leitstellen-Verbund-Programmordner.');
  const appIdentity = metadata(app), dataIdentity = metadata(data);
  const receiptPath = resolve(data, `hard-reset-${requestId}.json`);
  const existing = readSmall(receiptPath);
  if (existing) {
    const receipt = parseRecord(existing, 'Reset-Beleg');
    if (receipt.format !== 'leitstellen-hard-reset-v1' || receipt.request !== requestId)
      throw Error('Reset-Beleg ungültig. Keine Daten gelöscht.');
    if (receipt.state === 'completed') return { repeated: true, deletedFiles: 0, dataDir: data };
    throw Error('Dieser Reset wurde unterbrochen. Nichts erneut gelöscht. App gestoppt lassen; Zustand und Lock prüfen.');
  }
  const lock = lockData(data);
  let pending = false;
  try {
    const paths = [];
    for (const name of readdirSync(data))
      if (databaseFiles.has(name) || migrationCopy.test(name) || restoreCopy.test(name)) paths.push(resolve(data, name));
    const backups = resolve(data, 'backups');
    const backupsInfo = metadata(backups);
    if (backupsInfo) {
      directory(backups);
      for (const name of readdirSync(backups))
        if (generatedBackup.test(name)) paths.push(resolve(backups, name));
    }
    const adminTemporary = new RegExp(`^admin-konto\\.json\\.${uuid}\\.tmp$`, 'i');
    for (const name of readdirSync(app))
      if (OBSOLETE_FILES.includes(name) || adminTemporary.test(name)) paths.push(resolve(app, name));
    // Validate ALL candidates before the first unlink. Unknown files are deliberately preserved.
    const plan = paths.map(path => ({ path, info: regular(path) }));
    for (const { path, info } of plan) {
      if (!info) throw Error('Dateien während der Prüfung geändert.');
      accessSync(dirname(path), constants.W_OK | constants.X_OK);
    }
    lock.assertOwned();
    const receipt = {
      format: 'leitstellen-hard-reset-v1', request: requestId,
      state: 'pending', created: new Date().toISOString(), deletedFiles: 0,
    };
    // Consumed BEFORE deletion: leaving these arguments in AMP cannot erase a later fresh world.
    pending = true;
    createPrivate(receiptPath, receipt);
    for (const { path, info } of plan) {
      lock.assertOwned();
      const nowApp = metadata(app), nowData = metadata(data);
      if (nowApp?.ino !== appIdentity.ino || nowApp?.dev !== appIdentity.dev ||
          nowData?.ino !== dataIdentity.ino || nowData?.dev !== dataIdentity.dev ||
          nowApp.isSymbolicLink() || nowData.isSymbolicLink()) throw Error('Ordner während des Resets geändert.');
      if (dirname(path) === backups) {
        const current = metadata(backups);
        if (!current?.isDirectory() || current.isSymbolicLink() || current.ino !== backupsInfo.ino || current.dev !== backupsInfo.dev)
          throw Error('Sicherungsordner während des Resets geändert.');
      }
      if (!sameFile(regular(path), info)) throw Error('Datei während des Resets geändert.');
      unlinkSync(path);
      syncDirectory(dirname(path));
      receipt.deletedFiles++;
    }
    if (backupsInfo && readdirSync(backups).length === 0) { rmdirSync(backups); syncDirectory(data); }
    const temp = `${receiptPath}.tmp`;
    createPrivate(temp, { ...receipt, state: 'completed', completed: new Date().toISOString() });
    renameSync(temp, receiptPath);
    syncDirectory(data);
    pending = false;
    return { repeated: false, deletedFiles: receipt.deletedFiles, dataDir: data };
  } catch (error) {
    if (pending) throw Error(`Reset nicht vollständig bestätigt. Keine Erfolgsmeldung: ${error.message} Wartungssperre bleibt; nicht einfach neu starten.`);
    throw error;
  } finally {
    // A partial reset must keep the game blocked rather than run with a partially deleted world.
    if (!pending) lock.release();
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Node.js 24 erforderlich.');
    const args = process.argv.slice(2);
    if (args.length !== 3 || args[0] !== '--confirm-delete-all-player-data' || args[1] !== '--request')
      throw Error('Aufruf: scripts/hard-reset.mjs --confirm-delete-all-player-data --request EINMALIGE-KENNUNG');
    const programDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const env = resolve(programDir, '.env');
    if (metadata(env)) loadEnvFile(env);
    const dataDir = resolve(process.env.DATA_DIR || resolve(programDir, '../leitstellen-data'));
    console.log(`Einmaliger Offline-Reset: ${dataDir}. Keine neue Sicherung; bekannte alte Spielbackups werden entfernt.`);
    const result = hardReset({ programDir, dataDir, requestId: args[2], confirmed: true });
    console.log(result.repeated
      ? 'Dieser Reset ist bereits erledigt. Keine weiteren Daten gelöscht.'
      : `HARDRESET ERFOLGREICH: ${result.deletedFiles} bekannte Dateien entfernt. Beim nächsten Spielstart registrieren sich alle neu.`);
    console.log('In AMP App Name auf dist/server/index.js zurückstellen und App Command Line Arguments leeren.');
  } catch (error) {
    console.error(`HARDRESET ABGEBROCHEN: ${error.message}`);
    process.exitCode = 1;
  }
}
