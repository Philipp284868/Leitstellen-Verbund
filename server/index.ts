import { deskOwner } from "./workspaces";
import { IS_GERMANY } from "../src/world-choice";
import { prepareGeography, type Geography } from "./germany/runtime";
import { germanyProvider } from "../src/germany/world";
import { inBounds } from "../src/germany/projection";
import { buildReason } from "../src/purchase";
import { approach } from "../src/travel";
import { hospitalOptions } from "../src/simulation/hospitals";
import { alarmSchema } from "../src/simulation/schema";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Server, type Socket } from "socket.io";
import { RouteSnapshotEncoder } from "./germany/snapshots";
import { z } from "zod";
import { config, root, type Config } from "./config";
import { Database } from "./database";
import {
  Auth,
  verifyPassword,
  usernameSchema,
  passwordSchema,
  profileNameSchema,
} from "./auth";
import { parseMode } from "../src/mode";
import { Game } from "./game";
import { acquireLock } from "./lock";

const loginSchema = z
  .object({ username: usernameSchema, password: passwordSchema })
  .strict();
const registerSchema = loginSchema
  .extend({ name: profileNameSchema, station: profileNameSchema })
  .strict();
async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("JSON erforderlich.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw Error("Anfrage zu groß.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export function startServer(
  c: Config,
  clientDir = resolve(root, IS_GERMANY ? "dist/germany/client" : "dist/client"),
  geography?: Geography,
) {
  if (IS_GERMANY && !geography)
    throw Error("Deutschland-Geodaten vor dem Serverstart initialisieren.");
  const release = acquireLock(c.dataDir);
  let db: Database;
  try {
    db = new Database(c.dataDir);
  } catch (e) {
    release();
    throw e;
  }
  const auth = new Auth(db),
    game = new Game(db);
  const prior = db.sql
    .prepare("SELECT value FROM meta WHERE key=?")
    .get("lastTick");
  try {
    game.step(
      prior
        ? Math.min(
            14400,
            Math.max(0, (Date.now() - Number(prior.value)) / 1000),
          )
        : 0,
    );
  } catch (e) {
    db.close();
    release();
    throw e;
  }
  let failed = false,
    stopping = false;
  const online = () =>
    new Set(
      Array.from(io.sockets.sockets.values())
        .filter((s) => s.data.mode === "multi")
        .map((s) => String(s.data.user)),
    );
  const reply = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  };
  const cookie = (value: string, clear = false) =>
    `lv_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 7 * 86400}${c.secure ? "; Secure" : ""}`;
  function ip(req: IncomingMessage) {
    const address = req.socket.remoteAddress || "",
      real = req.headers["x-real-ip"];
    return c.trustedProxies.includes(address) && typeof real === "string"
      ? real
      : address;
  }
  const pendingHttp = new Set<Promise<void>>();
  const http = createServer((req, res) => {
    const task = handleHttp(req, res);
    pendingHttp.add(task);
    void task.then(
      () => pendingHttp.delete(task),
      () => pendingHttp.delete(task),
    );
  });
  const connections = new Set<import("node:net").Socket>();
  http.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });
  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (c.secure)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      if (stopping)
        return reply(res, 503, { error: "Server wird angehalten." });
      const requestUrl = new URL(req.url || "/", c.publicUrl);
      const path = requestUrl.pathname;
      if (path.startsWith("/geo/") && geography) {
        if (req.method !== "GET")
          return reply(res, 405, { error: "GET erforderlich." });
        if (
          path !== "/geo/manifest" &&
          !path.startsWith("/geo/tiles/") &&
          !path.startsWith("/geo/dem/")
        )
          auth.limit(`geo:${ip(req)}`, 120, 60000);
        if (geography.maps.handle(path, requestUrl, res)) return;
        return reply(res, 404, { error: "Geodaten-Endpunkt nicht verfügbar." });
      }
      if (path === "/api/health" && req.method === "GET")
        return reply(res, failed ? 503 : 200, { ok: !failed });
      // Retired privileged endpoints are not available to anybody, including former administrators.
      if (path === "/api/admin" || path.startsWith("/api/admin/"))
        return reply(res, 404, { error: "API-Endpunkt nicht verfügbar." });
      const session = auth.session(req.headers.cookie);
      const mode = parseMode(req.headers["x-game-mode"]);
      if (path.startsWith("/api/")) {
        if (!["GET", "POST"].includes(req.method || ""))
          return reply(res, 405, { error: "Methode nicht erlaubt." });
        if (req.method === "POST" && req.headers.origin !== c.publicUrl)
          return reply(res, 403, { error: "Origin nicht erlaubt." });
        if (path === "/api/login" || path === "/api/register") {
          if (req.method !== "POST")
            return reply(res, 405, { error: "POST erforderlich." });
          auth.limit(`auth-ip:${ip(req)}`, 20);
          if (path === "/api/register") {
            // Public registration still has persistent per-source and server-wide abuse limits.
            auth.limit(`registration-ip:${ip(req)}`, 20, 3600000);
            auth.limit("registration-global", 100, 600000);
          }
          const raw = await body(req);
          const parsed = loginSchema.passthrough().parse(raw);
          auth.limit(`auth-user:${parsed.username}`, 10);
          let id: string;
          if (path === "/api/register") {
            const data = registerSchema.parse(raw);
            id = await auth.create(
              data.username,
              data.password,
              data.name,
              data.station,
            );
          } else {
            const data = loginSchema.parse(raw);
            const row = db.sql
              .prepare(
                "SELECT id,password FROM users WHERE username=? AND role='player'",
              )
              .get(data.username);
            const encoded = row
              ? String(row.password)
              : `scrypt-65536-8-1:nonexistent-account:${"0".repeat(128)}`;
            if (!(await verifyPassword(data.password, encoded)) || !row)
              return reply(res, 401, { error: "Anmeldung fehlgeschlagen." });
            id = String(row.id);
          }
          const issued = auth.issue(id);
          res.setHeader("Set-Cookie", cookie(issued.value));
          return reply(res, 200, { ok: true });
        }
        if (!session) return reply(res, 401, { error: "Bitte anmelden." });
        if (path.startsWith("/api/geo/") && IS_GERMANY) {
          if (req.method !== "GET")
            return reply(res, 405, { error: "GET erforderlich." });
          auth.limit(`geo-player:${session.user_id}`, 120, 60000);
          const params = requestUrl.searchParams,
            p = { x: Number(params.get("x")), y: Number(params.get("y")) };
          if (!params.has("x") || !params.has("y") || !inBounds(p))
            return reply(res, 400, { error: "Ungültiger Kartenstandort." });
          const s = game.view(session.user_id, online(), mode).save;
          if (path === "/api/geo/site") {
            const kind = params.get("type") || "fire",
              anchor = germanyProvider().nearest(p);
            const reason =
              params.get("purpose") === "staff"
                ? germanyProvider().isLandSite(anchor)
                  ? null
                  : "Wohn- und Arbeitsorte benötigen einen zugänglichen Straßenstandort an Land."
                : buildReason(s, kind, p) || null;
            return reply(res, 200, {
              point: { x: anchor.x, y: anchor.y },
              nodeId: anchor.id,
              reason,
            });
          }
          const vehicleId = params.get("vehicle"),
            missionId = params.get("mission");
          const v = vehicleId
            ? s.vehicles.find((v) => v.id === vehicleId)
            : undefined;
          const m = missionId
            ? s.missions.find((m) => m.id === missionId)
            : undefined;
          if ((vehicleId && !v) || (missionId && !m))
            return reply(res, 403, {
              error: "Objekt gehört nicht zur berechtigten Leitstelle.",
            });
          if (path === "/api/geo/approach") {
            if (!v) return reply(res, 400, { error: "Fahrzeug fehlt." });
            const travel = z
              .enum(["normal", "priority", "emergency"])
              .parse(params.get("mode") || "priority");
            const alarm = params.get("alarm")
              ? alarmSchema.parse(params.get("alarm"))
              : undefined;
            return reply(res, 200, { text: approach(s, v, p, travel, alarm) });
          }
          if (path === "/api/geo/hospitals") {
            const seats = z.coerce
              .number()
              .int()
              .min(0)
              .max(100)
              .parse(params.get("seats") || "0");
            return reply(res, 200, {
              options: hospitalOptions(s, p, seats, m, v),
            });
          }
          return reply(res, 404, {
            error: "Geodaten-Endpunkt nicht verfügbar.",
          });
        }
        if (
          req.method === "POST" &&
          req.headers["x-csrf-token"] !== session.csrf
        )
          return reply(res, 403, { error: "CSRF-Prüfung fehlgeschlagen." });
        if (path === "/api/me" && req.method === "GET") {
          return reply(res, 200, {
            user: {
              id: session.user_id,
              username: session.username,
              role: session.role,
            },
            csrf: session.csrf,
            ...game.view(session.user_id, online(), mode),
          });
        }
        if (path === "/api/logout" && req.method === "POST") {
          db.sql.prepare("DELETE FROM sessions WHERE hash=?").run(session.hash);
          disconnectSession(session.hash);
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, { ok: true });
        }
        if (path === "/api/logout-all" && req.method === "POST") {
          db.sql
            .prepare("DELETE FROM sessions WHERE user_id=?")
            .run(session.user_id);
          for (const socket of io.sockets.sockets.values())
            if (socket.data.user === session.user_id) socket.disconnect(true);
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, { ok: true });
        }
        if (path === "/api/password" && req.method === "POST") {
          auth.limit(`password:${session.user_id}`, 5);
          const data = z
            .object({ current: passwordSchema, password: passwordSchema })
            .strict()
            .parse(await body(req));
          const row = db.sql
            .prepare("SELECT password FROM users WHERE id=?")
            .get(session.user_id)!;
          if (!(await verifyPassword(data.current, String(row.password))))
            throw Error("Aktuelles Passwort stimmt nicht.");
          const { passwordHash } = await import("./auth");
          const encoded = await passwordHash(data.password);
          db.transaction(() => {
            db.sql
              .prepare("UPDATE users SET password=? WHERE id=?")
              .run(encoded, session.user_id);
            db.sql
              .prepare("DELETE FROM sessions WHERE user_id=?")
              .run(session.user_id);
            db.audit(session.user_id, "password-changed");
          });
          for (const socket of io.sockets.sockets.values())
            if (socket.data.user === session.user_id) socket.disconnect(true);
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, { ok: true });
        }
        if (path === "/api/action" && req.method === "POST") {
          if (failed)
            return reply(res, 503, {
              error:
                "Simulation pausiert wegen Speicherfehler. Serverbetreiber informieren.",
            });
          auth.limit(`action:${session.user_id}`, 60, 1000);
          game.command(session.user_id, await body(req), mode);
          const publishedView = publish();
          return reply(res, 200, publishedView(session.user_id, mode));
        }
        if (path === "/api/archive-export" && req.method === "GET") {
          const row = db.sql
            .prepare("SELECT data FROM solo_saves WHERE user_id=?")
            .get(session.user_id);
          if (!row)
            return reply(res, 404, {
              error:
                "Kein archivierter Einzelspielerstand für dieses Konto vorhanden.",
            });
          return reply(res, 200, {
            format: "leitstellen-verbund-archive",
            version: 1,
            source: "retired-single-player",
            exportedAt: Date.now(),
            save: JSON.parse(String(row.data)),
          });
        }
        if (path === "/api/export" && req.method === "GET")
          return reply(res, 200, {
            format: "leitstellen-verbund",
            version: 1,
            exportedAt: Date.now(),
            mode,
            save: game.view(session.user_id, online(), mode).save,
          });
        return reply(res, 404, { error: "API-Endpunkt nicht verfügbar." });
      }
      if (!["GET", "HEAD"].includes(req.method || ""))
        return reply(res, 405, { error: "Methode nicht erlaubt." });
      let relative =
        path === "/" ? "index.html" : decodeURIComponent(path).slice(1);
      if (
        !(
          relative === "index.html" ||
          relative === "icon.svg" ||
          relative === "project-news.json" ||
          relative === "manifest.webmanifest" ||
          relative === "sw.js" ||
          /^assets\/[a-zA-Z0-9_.-]+$/.test(relative)
        )
      )
        return reply(res, 404, { error: "Nicht gefunden." });
      relative = resolve(clientDir, relative);
      const content = await readFile(relative);
      const types: Record<string, string> = {
        ".json": "application/json",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
      };
      res.setHeader(
        "Content-Type",
        types[extname(relative)] || "application/octet-stream",
      );
      if (path.startsWith("/assets/"))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (e) {
      const message =
        e instanceof z.ZodError
          ? "Ungültige Eingabe."
          : e instanceof Error
            ? e.message
            : "Anfrage fehlgeschlagen.";
      reply(
        res,
        /UNIQUE|constraint/i.test(message)
          ? 409
          : /Zu viele|ausgelastet/.test(message)
            ? 429
            : 400,
        {
          error: /SQL|constraint|UNIQUE|ENOENT/i.test(message)
            ? "Anfrage konnte nicht übernommen werden."
            : message,
        },
      );
    }
  }
  const io = new Server(http, {
    serveClient: false,
    maxHttpBufferSize: 8192,
    perMessageDeflate: {
      threshold: 4096,
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
    },
    allowRequest: (req, done) =>
      done(
        null,
        req.headers.origin === c.publicUrl ||
          (!req.headers.origin &&
            req.headers["sec-fetch-site"] === "same-origin"),
      ),
    cors: { origin: c.publicUrl, credentials: true },
  });
  io.engine.on("headers", (headers) => {
    headers["Cache-Control"] = "no-store";
  });
  function disconnectSession(value: string) {
    for (const s of io.sockets.sockets.values())
      if (s.data.session === value) s.disconnect(true);
  }
  io.use((socket, next) => {
    const session = auth.session(socket.request.headers.cookie);
    if (!session || socket.handshake.auth.csrf !== session.csrf)
      return next(Error("Anmeldung erforderlich."));
    try {
      socket.data.mode = parseMode(socket.handshake.auth.mode);
    } catch {
      return next(
        Error("Dieser Server unterstützt ausschließlich Multiplayer."),
      );
    }
    socket.data.user = session.user_id;
    socket.data.session = session.hash;
    next();
  });
  io.on("connection", (socket) => {
    deliverSnapshot(socket, online());
    socket.on("chat", (input: unknown) => {
      try {
        const session = auth.session(socket.request.headers.cookie);
        if (!session) return socket.disconnect(true);
        if (socket.data.mode !== "multi")
          throw Error(
            "Verbundfunk erfordert eine gültige Multiplayer-Verbindung.",
          );
        const text = z.string().trim().min(1).max(500).parse(input);
        auth.limit(`chat:${session.user_id}`, 2, 1000);
        const name = String(
          db.sql
            .prepare("SELECT username FROM users WHERE id=?")
            .get(session.user_id)!.username,
        );
        const owner = deskOwner(db, session.user_id, "multi");
        for (const peer of io.sockets.sockets.values()) {
          if (
            peer.data.mode === "multi" &&
            auth.session(peer.request.headers.cookie) &&
            deskOwner(db, peer.data.user, "multi") === owner
          )
            peer.emit("chat", { name, text });
        }
      } catch {
        socket.emit(
          "notice",
          "Nachricht abgelehnt (Länge, Sitzung oder Ratenbegrenzung).",
        );
      }
    });
  });
  const encoders = new WeakMap<Socket, RouteSnapshotEncoder>();
  function deliverSnapshot(
    socket: Socket,
    peers: Set<string>,
    view = game.view(socket.data.user, peers, socket.data.mode),
  ) {
    if (IS_GERMANY && socket.handshake.auth.routeSnapshots === 1) {
      let encoder = encoders.get(socket);
      if (!encoder) {
        encoder = new RouteSnapshotEncoder();
        encoders.set(socket, encoder);
      }
      socket.emit("snapshot", encoder.encode(view));
    } else socket.emit("snapshot", view);
  }
  function publish() {
    const peers = online();
    // Reuse only within this synchronous publication. Different actors must
    // retain their own permissions/workspace even when they share a dispatch.
    const views = new Map<string, ReturnType<typeof game.view>>();
    const viewFor = (actor: string, mode: ReturnType<typeof parseMode>) => {
      const key = JSON.stringify([actor, mode]);
      let view = views.get(key);
      if (!view) {
        view = game.view(actor, peers, mode);
        views.set(key, view);
      }
      return view;
    };
    for (const socket of io.sockets.sockets.values()) {
      if (!auth.session(socket.request.headers.cookie)) socket.disconnect(true);
      else
        deliverSnapshot(
          socket,
          peers,
          viewFor(socket.data.user, socket.data.mode),
        );
    }
    return viewFor;
  }
  let last = Date.now();
  const timer = setInterval(() => {
    if (failed || stopping) return;
    const now = Date.now();
    try {
      game.step(Math.min(60, Math.max(0, (now - last) / 1000)), now);
      last = now;
      publish();
    } catch {
      failed = true;
      console.error(
        "Simulation wegen Speicher-/Validierungsfehler pausiert. Datenbank prüfen.",
      );
      io.emit(
        "notice",
        "Server-Simulation pausiert. Serverbetreiber informieren.",
      );
    }
  }, 1000);
  let backupJob: Promise<unknown> = Promise.resolve();
  const backupTimer = setInterval(() => {
    backupJob = backupJob
      .then(() => db.backup())
      .catch(() => console.error("Automatische Sicherung fehlgeschlagen."));
  }, 3600000);
  let closePromise: Promise<void> | undefined;
  return {
    db,
    auth,
    game,
    http,
    io,
    listen: () =>
      new Promise<void>((done, reject) => {
        http.once("error", reject);
        http.listen(c.port, c.host, done);
      }),
    close: () =>
      (closePromise ??= (async () => {
        stopping = true;
        clearInterval(timer);
        clearInterval(backupTimer);
        // Allow normal responses to drain; incomplete headers must not keep shutdown alive.
        const closed = new Promise<void>((done) => io.close(() => done()));
        const deadline = setTimeout(() => {
          http.closeAllConnections();
          for (const connection of connections) connection.destroy();
        }, 2000);
        deadline.unref();
        http.closeIdleConnections();
        await closed;
        clearTimeout(deadline);
        await Promise.allSettled([...pendingHttp]);
        await backupJob;
        try {
          await db.backup();
        } finally {
          db.close();
          release();
          await geography?.close();
        }
      })()),
  };
}
if (process.argv[1] && /(?:^|[\\/])index\.js$/.test(process.argv[1])) {
  const c = config(),
    geography = await prepareGeography(c);
  let app: ReturnType<typeof startServer>;
  try {
    app = startServer(c, undefined, geography);
  } catch (error) {
    await geography?.close();
    throw error;
  }
  try {
    await app.listen();
  } catch (e) {
    await app.close();
    throw e;
  }
  console.log(
    `Leitstellen-Verbund bereit: ${c.host}:${c.port} · ${c.publicUrl} · Freie Registrierung, nur Spielerkonten.`,
  );
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void app
      .close()
      .then(() => process.exit(0))
      .catch(() => {
        console.error("Sauberes Beenden fehlgeschlagen. Daten nicht löschen.");
        process.exit(1);
      });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  if (process.connected) process.once("disconnect", stop);
  process.on("message", (message) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "shutdown"
    )
      stop();
  });
}
