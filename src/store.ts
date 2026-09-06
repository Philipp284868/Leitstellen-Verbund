import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import type { Save } from "./model";
import type { ServerAction } from "../server/actions";
import type { Action } from "./engine";
import { setNetwork, resetNetwork, receiveChat } from "./network";
export interface Snapshot {
  save: Save | null;
  loading: boolean;
  readonly: boolean;
  error: string;
  notice: string;
  user: { id: string; username: string; role: string } | null;
}
let snapshot: Snapshot = {
  save: null,
  loading: true,
  readonly: true,
  error: "",
  notice: "",
  user: null,
};
let csrf = "",
  socket: Socket | null = null,
  started = false;
const listeners = new Set<() => void>();
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
export function notice(text: string) {
  emit({ notice: text });
}
function clear() {
  const previous = socket;
  socket = null;
  previous?.removeAllListeners();
  previous?.disconnect();
  csrf = "";
  resetNetwork();
  emit({ save: null, user: null, readonly: true, loading: false });
}
export async function api(path: string, data?: unknown) {
  const r = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== "login") clear();
    throw Error(result.error || "Serveranfrage fehlgeschlagen.");
  }
  return result;
}
function accept(data: {
  save: Save;
  network: Parameters<typeof setNetwork>[0];
}) {
  if (!snapshot.user || data.save.player.id !== snapshot.user.id) return;
  if (!snapshot.save || data.save.revision >= snapshot.save.revision)
    emit({ save: data.save });
  setNetwork(data.network);
}
export async function refresh() {
  const data = await api("me");
  csrf = data.csrf;
  emit({ user: data.user, save: data.save, loading: false, error: "" });
  setNetwork(data.network);
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: (cb) => cb({ csrf }),
      withCredentials: true,
    });
    socket.on("connect", () =>
      emit({ readonly: false, notice: "Mit Spielserver verbunden." }),
    );
    socket.on("disconnect", (reason) => {
      emit({
        readonly: true,
        notice:
          "Verbindung getrennt. Aktionen sind gesperrt; der Server simuliert weiter.",
      });
      resetNetwork();
      if (reason === "io server disconnect") clear();
    });
    socket.on("connect_error", () => {
      emit({
        readonly: true,
        notice: "Server nicht erreichbar oder Sitzung abgelaufen.",
      });
      void api("me").catch(() => {});
    });
    socket.on("snapshot", accept);
    socket.on("chat", receiveChat);
    socket.on("notice", notice);
    socket.connect();
  }
}
export async function login(
  data: {
    username: string;
    password: string;
    name?: string;
    station?: string;
    invite?: string;
  },
  register = false,
) {
  await api(register ? "register" : "login", data);
  clear();
  await refresh();
}
export async function logout(all = false) {
  await api(all ? "logout-all" : "logout", {});
  clear();
}
export async function command(action: ServerAction | Action) {
  if (snapshot.readonly || !socket?.connected)
    throw Error("Keine Serververbindung. Aktion wurde nicht ausgeführt.");
  const id = crypto.randomUUID();
  let result;
  try {
    result = await api("action", { id, action });
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    result = await api("action", { id, action });
  }
  accept(result);
  emit({ error: "" });
}
export const act = (action: ServerAction | Action) =>
  command(action).catch((e) => emit({ error: e.message }));
export async function change(fn: (s: Save) => void) {
  const before = snapshot.save;
  if (!before) throw Error("Bitte anmelden.");
  const next = structuredClone(before);
  fn(next);
  if (JSON.stringify(next.settings) !== JSON.stringify(before.settings))
    return act({ type: "settings", ...next.settings });
  if (next.templates.length === before.templates.length + 1)
    return act({ type: "template", ...next.templates.at(-1)! });
  throw Error("Nur explizite Serveraktionen sind erlaubt.");
}
export function sendChat(text: string) {
  if (!socket?.connected) throw Error("Keine Serververbindung.");
  socket.emit("chat", text);
}
export function start() {
  if (started) return;
  started = true;
  void refresh().catch((e) =>
    emit({
      loading: false,
      error: e.message === "Bitte anmelden." ? "" : e.message,
    }),
  );
}
export const retryStorage = refresh;
export async function flushSave() {
  await refresh();
}
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    emit({
      readonly: true,
      notice:
        "Offline. Keine Spielaktionen möglich; der Server simuliert weiter.",
    });
    socket?.disconnect();
  });
  window.addEventListener("online", () => socket?.connect());
}
