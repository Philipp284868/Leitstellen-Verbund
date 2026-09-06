import { readFile, stat, copyFile, rename, unlink } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { config } from "./config";
import { Database } from "./database";
import { Auth } from "./auth";
import { validate, uid } from "../src/model";
import { acquireLock } from "./lock";

const c = config(),
  command = process.argv[2];
const arg = (key: string) => {
  const i = process.argv.indexOf(`--${key}`);
  if (i < 0 || !process.argv[i + 1]) throw Error(`--${key} fehlt.`);
  return process.argv[i + 1];
};
if (command === "unlock") {
  if (!process.argv.includes("--confirm"))
    throw Error("Lock-Freigabe benötigt --confirm nach AMP-Stopp.");
  const file = resolve(c.dataDir, "server.lock"),
    lock = JSON.parse(await readFile(file, "utf8"));
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0)
    throw Error("Lock-Datei ungültig. Manuell prüfen.");
  let dead = false;
  try {
    process.kill(lock.pid, 0);
  } catch (e) {
    dead = (e as NodeJS.ErrnoException).code === "ESRCH";
  }
  if (!dead)
    throw Error(
      "Prozess existiert noch oder Berechtigung unklar. Lock bleibt erhalten.",
    );
  await unlink(file);
  console.log("Verwaistes Prozess-Lock entfernt. Keine Spieldaten geändert.");
  process.exit(0);
}
// Administration that changes the world is deliberately an offline operation.
const release = acquireLock(c.dataDir);
try {
  if (command === "restore") {
    if (!process.argv.includes("--confirm"))
      throw Error("Wiederherstellung benötigt --confirm.");
    const file = resolve(arg("file"));
    const input = new DatabaseSync(file, { readOnly: true });
    try {
      if (
        input.prepare("PRAGMA integrity_check").get()!.integrity_check !==
          "ok" ||
        input.prepare("PRAGMA user_version").get()!.user_version !== 1
      )
        throw Error("Sicherung ungültig oder inkompatibel.");
      const users = new Set(
        input
          .prepare("SELECT id FROM users")
          .all()
          .map((r) => String(r.id)),
      );
      for (const row of input.prepare("SELECT user_id,data FROM saves").all()) {
        const s = validate(JSON.parse(String(row.data)));
        if (s.player.id !== row.user_id || !users.has(s.player.id))
          throw Error("Ungültiger Kontobesitz in Sicherung.");
      }
    } finally {
      input.close();
    }
    const existing = new Database(c.dataDir);
    const previous = await existing.backup();
    existing.close();
    const staged = resolve(c.dataDir, `restore-${uid()}.sqlite`);
    await copyFile(file, staged);
    const restored = new DatabaseSync(staged);
    try {
      restored.exec("DELETE FROM sessions;");
    } finally {
      restored.close();
    }
    // Atomic replacement only after a verified backup; the checkpointed original stays in backups.
    const target = resolve(c.dataDir, "game.sqlite");
    try {
      await rename(staged, target);
    } catch (e) {
      console.error(`Vorherige konsistente Sicherung: ${previous}`);
      throw e;
    }
    console.log(
      "Wiederhergestellt. Alle Sitzungen widerrufen. Server kann gestartet werden.",
    );
  } else {
    const db = new Database(c.dataDir),
      auth = new Auth(db);
    try {
      if (command === "admin-create") {
        if (!process.argv.includes("--password-stdin"))
          throw Error(
            "Passwort ausschließlich per --password-stdin übergeben.",
          );
        let password = "";
        for await (const chunk of process.stdin) {
          password += chunk;
          if (password.length > 256) throw Error("Passwort zu lang.");
        }
        await auth.create(
          arg("username"),
          password.trimEnd(),
          arg("name"),
          arg("station"),
          undefined,
          true,
        );
        console.log(
          "Erstadministrator angelegt. Jetzt mit dem gewählten Konto anmelden.",
        );
      } else if (command === "invite")
        console.log(auth.invite("server-console"));
      else if (command === "backup") console.log(await db.backup());
      else if (command === "legacy-import") {
        if (!process.argv.includes("--confirm-replace-and-reset-active"))
          throw Error(
            "Explizite Freigabe --confirm-replace-and-reset-active erforderlich.",
          );
        const file = arg("file");
        if ((await stat(file)).size > 8 * 1024 * 1024)
          throw Error("Datei größer als 8 MB.");
        const raw = JSON.parse(await readFile(file, "utf8"));
        if (
          raw.format !== "leitstellen-verbund" ||
          raw.version !== 1 ||
          !Number.isFinite(raw.exportedAt)
        )
          throw Error("Unbekanntes Sicherungsformat.");
        let s = validate(raw.save);
        const user = db.sql
          .prepare("SELECT id FROM users WHERE username=?")
          .get(arg("username"));
        if (!user) throw Error("Zielkonto fehlt.");
        const old = db.all().get(String(user.id))!;
        const ids = new Map([
          [s.player.id, String(user.id)],
          ...[...s.buildings, ...s.people, ...s.vehicles].map(
            (o) => [o.id, uid()] as [string, string],
          ),
        ]);
        s = JSON.parse(
          JSON.stringify(s, (_key, value) =>
            typeof value === "string" ? ids.get(value) || value : value,
          ),
        );
        s.player.id = String(user.id);
        s.player.name = old.player.name;
        s.player.station = old.player.station;
        s.generation = uid();
        s.missions = [];
        s.archive = [];
        s.receipts = [];
        s.contributions = [];
        s.transfers = [];
        s.deliveryAcks = [];
        s.beds = [];
        for (const v of s.vehicles) {
          v.status = "ready";
          v.mission = null;
          v.assignment = null;
          v.patients = 0;
          v.path = [s.buildings.find((b) => b.id === v.home)!.pos];
          v.depart = s.time;
          v.arrive = s.time;
        }
        validate(s);
        const fileBackup = await db.backup();
        db.transaction(() => {
          const all = db.all();
          if (
            Array.from(all.values()).some((p) =>
              p.vehicles.some((v) =>
                v.mission?.startsWith(`remote:${user.id}:`),
              ),
            )
          )
            throw Error(
              "Andere Konten unterstützen das Zielkonto noch. Erst Einsätze abschließen.",
            );
          if (old.vehicles.some((v) => v.mission))
            throw Error(
              "Zielkonto hat aktive Fahrzeuge. Erst Aufträge abschließen.",
            );
          db.save(String(user.id), s);
          db.sql.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
          db.audit("server-console", `legacy-import:${user.id}`);
        });
        console.log(
          `Validierter Altbestand übernommen; aktive Vorgänge zurückgesetzt. Vorherige Datenbank: ${fileBackup}`,
        );
      } else
        throw Error(
          "Befehle: admin-create, invite, backup, restore, legacy-import. Siehe docs/AMP.md.",
        );
    } finally {
      db.close();
    }
  }
} finally {
  release();
}
