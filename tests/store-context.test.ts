import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fresh } from "../src/model";

const sockets = vi.hoisted(() => ({
  all: [] as {
    active: boolean;
    connected: boolean;
    handlers: Map<string, (...args: unknown[]) => void>;
    on: (name: string, callback: (...args: unknown[]) => void) => unknown;
    connect: () => unknown;
    disconnect: () => unknown;
    removeAllListeners: () => unknown;
    emit: (name: string, ...args: unknown[]) => unknown;
  }[],
}));
const network = vi.hoisted(() => ({
  setNetwork: vi.fn(),
  resetNetwork: vi.fn(),
  receiveChat: vi.fn(),
  resetPresence: vi.fn(),
  presenceConnection: vi.fn(),
  receivePresence: vi.fn(() => true),
}));
vi.mock("../src/network", () => network);
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("socket.io-client", () => ({
  io: () => {
    const socket = {
      active: false,
      connected: false,
      handlers: new Map<string, (...args: unknown[]) => void>(),
      on(name: string, callback: (...args: unknown[]) => void) {
        this.handlers.set(name, callback);
        return this;
      },
      connect() {
        this.active = true;
        this.connected = true;
        this.handlers.get("connect")?.();
        return this;
      },
      disconnect() {
        this.active = false;
        this.connected = false;
        this.handlers.get("disconnect")?.("io client disconnect");
        return this;
      },
      removeAllListeners() {
        this.handlers.clear();
        return this;
      },
      emit(_name: string, ..._args: unknown[]) {
        return this;
      },
    };
    sockets.all.push(socket);
    return socket;
  },
}));
let store: typeof import("../src/store"),
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function packet(
  context = 0,
  session: string | null = null,
  user = "account-a",
  generation = "world-live",
  revision = 1,
) {
  const save = fresh(user, "Test", 100);
  save.player.id = user;
  save.generation = generation;
  save.revision = revision;
  return {
    playContext: context,
    training: session ? { session, active: true } : null,
    mode: "multi",
    save,
    user: { id: user, username: user, role: "player" },
    csrf: `csrf-${user}-${context}`,
    network: { friends: [], support: [] },
  };
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function request(index: number) {
  const [path, init] = fetcher.mock.calls[index];
  return {
    path,
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}
async function connect(data = packet()) {
  fetcher.mockResolvedValueOnce(response(data));
  await store.refresh();
  expect(store.useGame().readonly).toBe(false);
  fetcher.mockClear();
}
beforeEach(async () => {
  vi.resetModules();
  sockets.all = [];
  vi.clearAllMocks();
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  store = await import("../src/store");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("monotone Spielkontexte verhindern verspätetes /me und bewahren neuen CSRF-/Übungsstand", async () => {
  await connect(packet(1, "old-training", "account-a", "old-world", 10));
  const old = deferred<Response>();
  fetcher.mockImplementationOnce(() => old.promise);
  const stale = store.refresh();
  fetcher.mockResolvedValueOnce(
    response(packet(3, "new-training", "account-a", "new-world", 1)),
  );
  await store.refresh();
  old.resolve(
    response(packet(1, "old-training", "old-user", "old-world", 999)),
  );
  await stale;
  expect(store.useGame()).toMatchObject({
    playContext: 3,
    user: { id: "account-a" },
    save: { generation: "new-world", revision: 1 },
  });
  fetcher.mockResolvedValueOnce(response({}));
  await store.api("diagnostic", {});
  expect(request(2).headers.get("X-CSRF-Token")).toBe("csrf-account-a-3");
  expect(request(2).headers.get("X-Training-Session")).toBeNull();
  expect(request(2).headers.get("X-Play-Context")).toBe("3");
});
it("alte 401- und /me-Antworten nach Logout/Login löschen oder überschreiben keine neue Kontositzung", async () => {
  await connect();
  const old401 = deferred<Response>(),
    oldMe = deferred<Response>();
  fetcher.mockImplementationOnce(() => old401.promise);
  const oldRequest = store.api("export");
  const rejected = expect(oldRequest).rejects.toThrow("alte Sitzung");
  fetcher.mockImplementationOnce(() => oldMe.promise);
  const oldRefresh = store.refresh();
  fetcher.mockResolvedValueOnce(response({}));
  await store.logout();
  fetcher.mockResolvedValueOnce(response({}));
  fetcher.mockResolvedValueOnce(
    response(packet(0, null, "account-b", "new-owner", 2)),
  );
  await store.login({ username: "account-b", password: "password" });
  old401.resolve(response({ error: "alte Sitzung" }, 401));
  await rejected;
  oldMe.resolve(
    response(packet(99, "foreign", "account-a", "old-owner", 9999)),
  );
  await oldRefresh;
  expect(store.useGame()).toMatchObject({
    playContext: 0,
    user: { id: "account-b" },
    readonly: false,
    save: { generation: "new-owner" },
  });
  expect(sockets.all.at(-1)?.connected).toBe(true);
});
it.each(["action"] as const)(
  "%s wird nach Kontowechsel nicht mit neuem Cookie/CSRF wiederholt",
  async () => {
    await connect();
    const old = deferred<Response>();
    fetcher.mockImplementationOnce(() => old.promise);
    const action = store.command({
      type: "template",
      name: "Alte private Auswahl",
      types: ["tsf"],
    });
    const finished = action.catch(() => {});
    fetcher.mockResolvedValueOnce(response({}));
    await store.logout();
    fetcher.mockResolvedValueOnce(response({}));
    fetcher.mockResolvedValueOnce(
      response(packet(0, null, "account-b", "new-owner", 1)),
    );
    await store.login({ username: "account-b", password: "password" });
    const requestsBeforeRetry = fetcher.mock.calls.length;
    // A vulnerable implementation would send this response-generating request as the new account.
    fetcher.mockResolvedValueOnce(
      response(packet(0, null, "account-b", "new-owner", 2)),
    );
    old.reject(new TypeError("late network failure"));
    await finished;
    expect(fetcher.mock.calls).toHaveLength(requestsBeforeRetry);
    expect(store.useGame()).toMatchObject({
      user: { id: "account-b" },
      save: { revision: 1 },
    });
  },
);
