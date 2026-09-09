import type { TutorialView, TrainingView } from "../server/tutorial";
import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import type { Save } from "./model";
import type { ServerAction } from "../server/actions";
import type { Action } from "./engine";
import {
  setNetwork,
  resetNetwork,
  receiveChat,
  resetPresence,
  presenceConnection,
  receivePresence,
} from "./network";
import type { GameMode } from "./mode";
import { createId } from "./ids";
import { IS_GERMANY } from "./world-choice";
import {
  RouteSnapshotDecoder,
  type RouteSnapshotFrame,
} from "./germany/snapshot";
export interface Snapshot {
  playContext: number;
  tutorial?: TutorialView;
  training?: TrainingView;
  mode: GameMode;
  workspace?: {
    outgoing: { id: string; name: string }[];
    owner: string;
    canManage: boolean;
    members: { id: string; name: string }[];
    invitations: { owner: string; name: string }[];
  };
  save: Save | null;
  loading: boolean;
  readonly: boolean;
  error: string;
  notice: string;
  user: { id: string; username: string; role: string } | null;
}
let snapshot: Snapshot = {
  playContext: 0,
  mode: "multi",
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
let clientEpoch = 0;
type RequestContext = {
  mode: GameMode;
  session: string | null;
  revision: number;
  epoch: number;
};
const requestContext = (): RequestContext => ({
  mode: snapshot.mode,
  session: snapshot.training?.session ?? null,
  revision: snapshot.playContext,
  epoch: clientEpoch,
});
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
  clientEpoch++;
  const previous = socket;
  socket = null;
  previous?.removeAllListeners();
  previous?.disconnect();
  csrf = "";
  resetNetwork();
  resetPresence();
  emit({
    playContext: 0,
    save: null,
    tutorial: undefined,
    training: null,
    workspace: undefined,
    user: null,
    readonly: true,
    loading: false,
  });
}
export async function api(
  path: string,
  data?: unknown,
  mode = snapshot.mode,
  context = requestContext(),
) {
  const r = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "X-Game-Mode": mode,
      "X-Play-Context": String(context.revision),
      ...(context.session ? { "X-Training-Session": context.session } : {}),
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== "login" && context.epoch === clientEpoch)
      clear();
    throw Error(result.error || "Serveranfrage fehlgeschlagen.");
  }
  return result;
}
function accept(data: {
  playContext?: number;
  tutorial?: TutorialView;
  training?: TrainingView;
  workspace?: Snapshot["workspace"];
  mode: GameMode;
  save: Save;
  network: Parameters<typeof setNetwork>[0];
}) {
  if (data.mode !== snapshot.mode) return;
  if ((data.playContext ?? 0) < snapshot.playContext) return;
  if (
    !snapshot.user ||
    data.save.player.id !== (data.workspace?.owner ?? snapshot.user.id)
  )
    return;
  if (
    !snapshot.save ||
    data.save.generation !== snapshot.save.generation ||
    data.save.revision >= snapshot.save.revision
  ) {
    if (snapshot.workspace?.owner !== data.workspace?.owner) resetNetwork();
    emit({
      playContext: data.playContext ?? 0,
      save: data.save,
      workspace: data.workspace,
      tutorial: data.tutorial,
      training: data.training,
    });
    setNetwork(data.network);
  }
}
export async function refresh() {
  const context = requestContext(),
    mode = context.mode;
  const data = await api("me", undefined, mode, context);
  if (
    context.epoch !== clientEpoch ||
    mode !== snapshot.mode ||
    (data.playContext ?? 0) < snapshot.playContext
  )
    return;
  csrf = data.csrf;
  emit({
    user: data.user,
    loading: false,
    error: "",
  });
  accept(data);
  if (!socket) {
    const routeDecoder = new RouteSnapshotDecoder<
      Parameters<typeof accept>[0]
    >();
    socket = io({
      autoConnect: false,
      // A browser WebSocket handshake supplies Origin on both HTTP and HTTPS.
      // Keep the server's strict Origin, session and CSRF checks unchanged.
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      auth: (cb) =>
        cb({ csrf, mode, ...(IS_GERMANY ? { routeSnapshots: 1 } : {}) }),
      withCredentials: true,
    });
    socket.on("connect", () => {
      presenceConnection(true);
      emit({
        readonly: false,
        error: "",
        notice: "Mit Spielserver verbunden.",
      });
    });
    socket.on("disconnect", (reason) => {
      presenceConnection(false);
      routeDecoder.reset();
      emit({
        readonly: true,
        notice:
          "Verbindung getrennt. Aktionen sind gesperrt; der Server simuliert weiter.",
      });
      resetNetwork();
      if (reason === "io server disconnect") clear();
    });
    socket.on("connect_error", () => {
      presenceConnection(false);
      emit({
        readonly: true,
        notice: "Server nicht erreichbar oder Sitzung abgelaufen.",
      });
      void api("me").catch(() => {});
    });
    socket.on(
      "snapshot",
      (
        frame:
          | Parameters<typeof accept>[0]
          | RouteSnapshotFrame<Parameters<typeof accept>[0]>,
      ) => {
        if ("protocol" in frame && frame.protocol === "lv-routes-1") {
          try {
            const data = routeDecoder.decode(frame);
            if (data) accept(data);
          } catch {
            emit({
              readonly: true,
              notice:
                "Kartendaten werden nachgeladen; Verbindung wird erneuert.",
            });
            routeDecoder.reset();
            socket?.disconnect().connect();
          }
        } else accept(frame as Parameters<typeof accept>[0]);
      },
    );
    socket.on("chat", receiveChat);
    socket.on("presence", (frame: unknown) => {
      if (!receivePresence(frame)) socket?.emit("presence:sync");
    });
    socket.on("notice", notice);
  }
  // The retry button must reconnect an existing disconnected socket too.
  if (!socket.connected) socket.connect();
}
export async function login(
  data: {
    username: string;
    password: string;
    name?: string;
    station?: string;
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
  const id = createId(),
    context = requestContext(),
    mode = context.mode;
  let result;
  try {
    result = await api("action", { id, action }, mode, context);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    if (context.epoch !== clientEpoch)
      throw Error(
        "Konto wurde gewechselt. Die alte Aktion wird nicht wiederholt.",
      );
    result = await api("action", { id, action }, mode, context);
  }
  if (context.epoch !== clientEpoch) return;
  accept(result);
  if (mode === snapshot.mode) emit({ error: "" });
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

export async function tutorialControl(data: unknown) {
  const context = requestContext();
  const result = await api("tutorial", data, context.mode, context);
  if (context.epoch === clientEpoch) accept(result);
}
export async function trainingControl(data: {
  op: "start" | "stop" | "scenario";
  reset?: boolean;
  kind?: "technical" | "fire";
  session?: string;
}) {
  const context = requestContext(),
    input = { ...data, id: createId() };
  let result;
  try {
    result = await api("training", input, context.mode, context);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    if (context.epoch !== clientEpoch)
      throw Error(
        "Konto wurde gewechselt. Die Übungsanfrage wird nicht wiederholt.",
      );
    result = await api("training", input, context.mode, context);
  }
  if (context.epoch === clientEpoch) accept(result);
}
