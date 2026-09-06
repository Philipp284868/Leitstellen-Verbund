import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Server } from "socket.io";
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
  clientDir = resolve(root, "dist/client"),
) {
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
  const http = createServer(async (req, res) => {
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
      const path = new URL(req.url || "/", c.publicUrl).pathname;
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
          if (mode === "single") db.ensureSolo(session.user_id);
          game.command(session.user_id, await body(req), mode);
          publish();
          return reply(res, 200, game.view(session.user_id, online(), mode));
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
          relative === "manifest.webmanifest" ||
          relative === "sw.js" ||
          /^assets\/[a-zA-Z0-9_.-]+$/.test(relative)
        )
      )
        return reply(res, 404, { error: "Nicht gefunden." });
      relative = resolve(clientDir, relative);
      const content = await readFile(relative);
      const types: Record<string, string> = {
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
  });
  const io = new Server(http, {
    serveClient: false,
    maxHttpBufferSize: 8192,
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
      return next(Error("Ungültiger Spielmodus."));
    }
    socket.data.user = session.user_id;
    socket.data.session = session.hash;
    next();
  });
  io.on("connection", (socket) => {
    socket.emit(
      "snapshot",
      game.view(socket.data.user, online(), socket.data.mode),
    );
    socket.on("chat", (input: unknown) => {
      try {
        const session = auth.session(socket.request.headers.cookie);
        if (!session) return socket.disconnect(true);
        if (socket.data.mode !== "multi")
          throw Error("Kein Verbundfunk im Einzelspieler.");
        const text = z.string().trim().min(1).max(500).parse(input);
        auth.limit(`chat:${session.user_id}`, 2, 1000);
        const name = game.view(session.user_id, online(), "multi").save.player
          .name;
        for (const peer of io.sockets.sockets.values()) {
          if (
            peer.data.mode === "multi" &&
            auth.session(peer.request.headers.cookie)
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
  function publish() {
    const peers = online();
    for (const socket of io.sockets.sockets.values()) {
      if (!auth.session(socket.request.headers.cookie)) socket.disconnect(true);
      else
        socket.emit(
          "snapshot",
          game.view(socket.data.user, peers, socket.data.mode),
        );
    }
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
    close: async () => {
      stopping = true;
      clearInterval(timer);
      clearInterval(backupTimer);
      await new Promise<void>((done) => io.close(() => done()));
      http.closeIdleConnections();
      await backupJob;
      try {
        await db.backup();
      } finally {
        db.close();
        release();
      }
    },
  };
}
if (process.argv[1] && /(?:^|[\\/])index\.js$/.test(process.argv[1])) {
  const c = config(),
    app = startServer(c);
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
}
