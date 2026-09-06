import { createId } from "./ids";
import Dexie, { type EntityTable } from "dexie";
import { validate, type Save } from "./model";
export const NS =
  "leitstellen-verbund-v1:" +
  (typeof location === "undefined"
    ? "test"
    : new URL(import.meta.env.BASE_URL, location.href).pathname);
export interface RecordSave {
  id: string;
  data: Save;
  at: number;
}
export class Database extends Dexie {
  saves!: EntityTable<RecordSave, "id">;
  constructor(name = NS) {
    super(name);
    this.version(1).stores({ saves: "id,at" });
    this.version(2)
      .stores({ saves: "id,at" })
      .upgrade((tx) =>
        tx
          .table("saves")
          .toCollection()
          .modify((row) => {
            row.data = validate(row.data);
          }),
      );
  }
}
export const db = new Database();
export async function read() {
  const row = await db.saves.get("current");
  return row ? { data: validate(row.data), at: row.at } : null;
}
export async function persist(s: Save, backup = false) {
  validate(s);
  await db.transaction("rw", db.saves, async () => {
    const now = Date.now();
    await db.saves.put({ id: "current", data: s, at: now });
    if (backup) {
      await db.saves.put({
        id: `backup:${now}:${createId()}`,
        data: s,
        at: now,
      });
      const rows = (await db.saves.toArray())
        .filter((r) => r.id.startsWith("backup:"))
        .sort((a, b) => b.at - a.at);
      await db.saves.bulkDelete(rows.slice(5).map((r) => r.id));
    }
  });
}
export async function backups() {
  return (await db.saves.toArray())
    .filter((x) => x.id !== "current")
    .sort((a, b) => b.at - a.at);
}
export function exportText(s: Save) {
  return JSON.stringify(
    {
      format: "leitstellen-verbund",
      version: 1,
      exportedAt: Date.now(),
      save: s,
    },
    null,
    2,
  );
}
export function inspectImport(text: string) {
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw Error("Datei größer als 8 MB.");
  const raw: unknown = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== "object" ||
    !("format" in raw) ||
    raw.format !== "leitstellen-verbund" ||
    !("version" in raw) ||
    raw.version !== 1 ||
    !("save" in raw)
  )
    throw Error("Unbekanntes Format oder nicht unterstützte Version.");
  if (
    !("exportedAt" in raw) ||
    typeof raw.exportedAt !== "number" ||
    !Number.isFinite(raw.exportedAt) ||
    raw.exportedAt < 0 ||
    raw.exportedAt > 8.64e15
  )
    throw Error("Ungültiges Sicherungsdatum.");
  return { save: validate(raw.save), exportedAt: raw.exportedAt };
}
export const parseImport = (text: string) => inspectImport(text).save;
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
