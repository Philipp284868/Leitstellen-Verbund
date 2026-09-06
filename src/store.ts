import { useSyncExternalStore } from "react";
import { fresh, uid, type Save } from "./model";
import { apply, tick, type Action } from "./engine";
import { read, persist, NS, db } from "./storage";
import type { Skills } from "./catalog";
export interface Snapshot {
  save: Save | null;
  loading: boolean;
  readonly: boolean;
  error: string;
  notice: string;
}
let snapshot: Snapshot = {
  save: null,
  loading: true,
  readonly: false,
  error: "",
  notice: "",
};
let remoteProvider: () => Record<string, Skills> = () => ({});
export function setRemoteProvider(provider: () => Record<string, Skills>) {
  remoteProvider = provider;
}
const listeners = new Set<() => void>();
let queue = Promise.resolve();
let started = false;
let release: (() => void) | null = null;
let last = Date.now();
let backupAt = 0;
let storageBlocked = false;
let profileChange = () => {};
export function onProfileChange(fn: () => void) {
  profileChange = fn;
}
export function emit(p: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...p };
  listeners.forEach((f) => f());
}
export const useGame = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => snapshot,
  );
export const state = () => snapshot.save;
export function change(fn: (s: Save) => void, backup = false): Promise<void> {
  const task = queue.then(async () => {
    if (snapshot.readonly)
      throw Error(
        "Dieser Tab ist schreibgeschützt. Schließe den anderen Spieltab und lade neu.",
      );
    if (!snapshot.save) throw Error("Kein Spielstand.");
    const next = structuredClone(snapshot.save);
    fn(next);
    next.revision++;
    try {
      await persist(next, backup);
    } catch (e) {
      storageBlocked = true;
      throw e;
    }
    emit({ save: next, error: "" });
  });
  queue = task.catch((e) =>
    emit({
      error: `Änderung nicht übernommen: ${e instanceof Error ? e.message : String(e)}`,
    }),
  );
  return task;
}
export const act = (a: Action) => change((s) => apply(s, a)).catch(() => {});
export function notice(text: string) {
  emit({ notice: text });
}
export async function newGame(name: string, station: string) {
  if (snapshot.readonly) throw Error("Schreibgeschützter Tab.");
  const next = fresh(name, station, Date.now() / 1000);
  await queue;
  if (snapshot.save) await persist(snapshot.save, true);
  await persist(next, true);
  profileChange();
  emit({ save: next, error: "" });
  last = Date.now();
  navigator.storage
    ?.persist?.()
    .then((ok) => {
      if (!ok)
        notice(
          "Dauerhafte Speicherung nicht zugesichert. Bitte regelmäßig eine Sicherungsdatei exportieren.",
        );
    })
    .catch(() => {});
}
export async function replaceSave(s: Save) {
  await queue;
  if (snapshot.readonly) throw Error("Schreibgeschützter Tab.");
  if (snapshot.save) await persist(snapshot.save, true);
  const next = structuredClone(s);
  next.generation = uid();
  await persist(next, true);
  profileChange();
  emit({ save: next, error: "" });
  last = Date.now();
}
export function start() {
  if (started) return;
  started = true;
  async function load(writer: boolean) {
    try {
      const row = await read();
      if (row && writer) {
        tick(
          row.data,
          row.data.time +
            Math.min(14400, Math.max(0, (Date.now() - row.at) / 1000)) *
              row.data.speed,
          {},
          true,
        );
        await persist(row.data);
      }
      emit({ save: row?.data ?? null, loading: false, readonly: !writer });
      last = Date.now();
    } catch (e) {
      emit({
        loading: false,
        error: `Speicher nicht verfügbar: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  if (navigator.locks)
    void navigator.locks.request(NS, { ifAvailable: true }, async (lock) => {
      await load(!!lock);
      if (lock)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    });
  else void load(false);
  setInterval(() => {
    const now = Date.now(),
      elapsed = Math.min(5, Math.max(0, (now - last) / 1000));
    last = now;
    if (!snapshot.save || snapshot.readonly || storageBlocked) return;
    const backup = now - backupAt > 60000;
    if (backup) backupAt = now;
    void change(
      (s) => tick(s, s.time + elapsed * s.speed, remoteProvider()),
      backup,
    ).catch(() => {});
  }, 1000);
}
export async function retryStorage() {
  await db.open();
  if (snapshot.save) await persist(snapshot.save);
  storageBlocked = false;
  emit({ error: "" });
}
export async function flushSave() {
  await queue;
  if (snapshot.save && !snapshot.readonly) await persist(snapshot.save, true);
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    emit({ readonly: true });
    void queue.finally(() => release?.());
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
}
