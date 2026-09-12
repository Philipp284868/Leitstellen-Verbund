import { BugReports } from "./bug-reports";
import { leaderboard, recordPlayTime } from "./leaderboard";
import { readFile } from "node:fs/promises";
import { AccountLifecycle } from "./account-lifecycle";
import { diagnostics } from "./diagnostics";
import { eventsPage } from "./game-events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve } from "node:path";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { inBounds } from "../src/germany/projection";
import { germanyProvider } from "../src/germany/world";
import { parseMode } from "../src/mode";
import type { Save } from "../src/model";
import type { PublicPlayer } from "../src/presence";
import { facilityResponse } from "./facilities/http";
import { assertFacilityMigration } from "./facilities/migration";
import { hospitalOptions } from "../src/simulation/hospitals";
import { publicSave } from "../src/simulation/incidents";
import { alarmSchema } from "../src/simulation/schema";
import { approach } from "../src/travel";
import {
  Auth,
  passwordSchema,
  profileNameSchema,
  usernameSchema,
  verifyPassword,
} from "./auth";
import { config, root, type Config } from "./config";
import {
  recordDatabaseReady,
  assertInstalledData,
} from "../scripts/installation.mjs";
import { Database } from "./database";
import { Game } from "./game";
import { prepareGeography, type Geography } from "./germany/runtime";
import { RouteSnapshotEncoder } from "./germany/snapshots";
import { exportHistory, historyPage } from "./history";
import { acquireLock } from "./lock";
import { WorldPresence, readPublicPresence } from "./presence";
import { deskOwner } from "./workspaces";
export { prepareGeography } from "./germany/runtime";
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
  geography?: Geography,
) {
  if (!geography)
    throw Error("Deutschland-Geodaten vor dem Serverstart initialisieren.");
  const release = acquireLock(c.dataDir);
  let db: Database;
  try {
    db = new Database(c.dataDir);
    try {
      assertFacilityMigration(db.sql);
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (e) {
    release();
    throw e;
  }
  const auth = new Auth(db),
    presence = new WorldPresence(),
    game = new Game(db, (desk) =>
      presence.playing(
        desk,
        Date.now(),
        (session, user) =>
          !!db.sql
            .prepare(
              "SELECT 1 FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND user_id=? AND expires>? AND role='player'",
            )
            .get(session, user, Date.now()),
        (user) => deskOwner(db, user, "multi"),
      ),
    );
  diagnostics.log("server", "DATABASE_READY");
  const viewForActor = (
    user: string,
    peers: Set<string>,
    mode: ReturnType<typeof parseMode>,
  ) => ({
    ...game.view(user, peers, mode),
    playContext: 0,
    events: eventsPage(db.sql, deskOwner(db, user, mode), undefined, user)
      .events,
  });
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
  const accountLifecycle = new AccountLifecycle(db);
  const bugReports = new BugReports(db.sql, c.githubIssuesToken);
  diagnostics.log(
    "reports",
    bugReports.configured() ? "REPORTING_CONFIGURED" : "REPORTING_DISABLED",
  );
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
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
        if (path.startsWith("/geo/pois/")) {
          // POIs load as bounded, cached tiles during panning. They must not
          // exhaust the lower search/node budget. Authenticated users behind
          // the same NAT receive independent budgets; public access stays open.
          const geoSession = auth.session(req.headers.cookie);
          const source = geoSession
            ? `user:${geoSession.user_id}`
            : `ip:${ip(req)}`;
          auth.limit(`geo-poi:${source}`, 1200, 60000);
        } else if (
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
        if (path === "/api/facilities" && req.method === "GET") {
          auth.limit(`facilities:${session.user_id}`, 240, 60000);
          return reply(
            res,
            200,
            facilityResponse(
              requestUrl,
              viewForActor(session.user_id, online(), mode).save,
            ),
          );
        }
        if (path.startsWith("/api/geo/")) {
          if (req.method !== "GET")
            return reply(res, 405, { error: "GET erforderlich." });
          auth.limit(`geo-player:${session.user_id}`, 120, 60000);
          const params = requestUrl.searchParams,
            p = { x: Number(params.get("x")), y: Number(params.get("y")) };
          if (!params.has("x") || !params.has("y") || !inBounds(p))
            return reply(res, 400, { error: "Ungültiger Kartenstandort." });
          const s = viewForActor(session.user_id, online(), mode).save;
          if (path === "/api/geo/site") {
            if (params.get("purpose") !== "staff")
              return reply(res, 410, {
                error:
                  "BUILDING_PURCHASE_ONLY: Bitte einen bestehenden Standort erwerben.",
              });
            const anchor = germanyProvider().nearest(p);
            const reason =
              params.get("purpose") === "staff"
                ? germanyProvider().isLandSite(anchor)
                  ? null
                  : "Wohn- und Arbeitsorte benötigen einen zugänglichen Straßenstandort an Land."
                : "BUILDING_PURCHASE_ONLY";
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
            ...viewForActor(session.user_id, online(), mode),
          });
        }
        if (["/api/tutorial", "/api/training"].includes(path))
          return reply(res, 410, {
            error:
              "Tutorial und Trainingswelt wurden eingestellt. Bitte die Seite neu laden.",
          });
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
          presence.revokeUser(session.user_id);
          for (const socket of io.sockets.sockets.values())
            if (socket.data.user === session.user_id) socket.disconnect(true);
          refreshPresence();
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, { ok: true });
        }
        if (path === "/api/account/prepare" && req.method === "POST") {
          auth.limit(`account:${session.user_id}`, 5);
          return reply(
            res,
            200,
            await accountLifecycle.prepare(session.user_id, await body(req)),
          );
        }
        if (path === "/api/account/confirm" && req.method === "POST") {
          auth.limit(`account-confirm:${session.user_id}`, 5);
          const result = accountLifecycle.confirm(
            session.user_id,
            await body(req),
          );
          presence.revokeUser(session.user_id);
          for (const socket of io.sockets.sockets.values())
            if (socket.data.user === session.user_id) socket.disconnect(true);
          refreshPresence();
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, result);
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
          presence.revokeUser(session.user_id);
          for (const socket of io.sockets.sockets.values())
            if (socket.data.user === session.user_id) socket.disconnect(true);
          refreshPresence();
          res.setHeader("Set-Cookie", cookie("", true));
          return reply(res, 200, { ok: true });
        }
        if (path === "/api/reports" && req.method === "GET") {
          auth.limit(`report-read:${session.user_id}`, 30, 60000);
          return reply(res, 200, {
            configured: bugReports.configured(),
            reports: bugReports.list(session.user_id),
          });
        }
        if (path === "/api/reports/preview" && req.method === "POST") {
          auth.limit(`report-prepare:${session.user_id}`, 10, 3600000);
          return reply(
            res,
            200,
            bugReports.prepare(session.user_id, await body(req)),
          );
        }
        if (path === "/api/reports/submit" && req.method === "POST") {
          auth.limit(`report-send:${session.user_id}`, 10, 3600000);
          const report = z
            .object({ id: z.uuid(), publish: z.literal(true) })
            .strict()
            .parse(await body(req));
          return reply(
            res,
            200,
            await bugReports.submit(session.user_id, report.id),
          );
        }
        if (path === "/api/action" && req.method === "POST") {
          if (failed)
            return reply(res, 503, {
              error:
                "Simulation pausiert wegen Speicherfehler. Serverbetreiber informieren.",
            });
          auth.limit(`action:${session.user_id}`, 60, 1000);
          if (
            req.headers["x-training-session"] ||
            Number(req.headers["x-play-context"] || 0) !== 0
          )
            return reply(res, 409, {
              error:
                "Veralteter Übungskontext. Bitte neu laden; keine Aktion ausgeführt.",
            });
          game.command(session.user_id, await body(req), mode);
          presenceDetailsDirty = true;
          const publishedView = publish();
          return reply(res, 200, publishedView(session.user_id, mode));
        }
        if (path === "/api/leaderboard" && req.method === "GET") {
          auth.limit(`leaderboard:${session.user_id}`, 30, 60000);
          const q = z
            .object({
              q: z.string().max(100).default(""),
              page: z.coerce.number().int().min(0).max(100000).default(0),
              sort: z.enum(["xp", "name", "calls"]).default("xp"),
            })
            .strict()
            .parse(Object.fromEntries(requestUrl.searchParams));
          return reply(
            res,
            200,
            leaderboard(db.sql, session.user_id, q.q, q.page, q.sort),
          );
        }
        if (path === "/api/events" && req.method === "GET") {
          const before = requestUrl.searchParams.has("at")
            ? z
                .object({
                  at: z.coerce.number().finite().nonnegative(),
                  id: z.string().max(200),
                })
                .parse({
                  at: requestUrl.searchParams.get("at"),
                  id: requestUrl.searchParams.get("id"),
                })
            : undefined;
          return reply(
            res,
            200,
            eventsPage(
              db.sql,
              deskOwner(db, session.user_id, mode),
              before,
              session.user_id,
            ),
          );
        }
        if (path === "/api/history" && req.method === "GET") {
          const params = requestUrl.searchParams;
          const options = z
            .object({
              page: z.coerce.number().int().min(0).max(1000000),
              query: z.string().max(200),
              org: z.string().max(40),
              major: z.boolean(),
            })
            .parse({
              page: params.get("page") ?? 0,
              query: params.get("query") ?? "",
              org: params.get("org") ?? "Alle",
              major: params.get("major") === "true",
            });
          return reply(
            res,
            200,
            historyPage(
              db.sql,
              deskOwner(db, session.user_id, mode),
              mode,
              options,
            ),
          );
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
          const archived = JSON.parse(String(row.data)) as Save;
          archived.archive = exportHistory(
            db.sql,
            session.user_id,
            "single",
            archived.archive,
          );
          return reply(res, 200, {
            format: "leitstellen-verbund-archive",
            version: 1,
            source: "retired-single-player",
            exportedAt: Date.now(),
            save: publicSave(archived),
          });
        }
        if (path === "/api/export" && req.method === "GET") {
          const save = viewForActor(session.user_id, online(), mode).save;
          save.archive = exportHistory(
            db.sql,
            deskOwner(db, session.user_id, mode),
            mode,
            save.archive,
          );
          return reply(res, 200, {
            format: "leitstellen-verbund",
            version: 1,
            exportedAt: Date.now(),
            mode,
            save,
          });
        }
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
          relative === "changelog.json" ||
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
    presence.revokeSession(value);
    for (const s of io.sockets.sockets.values())
      if (s.data.session === value) s.disconnect(true);
    refreshPresence();
  }
  let refreshingPresence = false;
  let presenceDetailsDirty = true;
  let publicPresenceCache = new Map<string, PublicPlayer>();
  function refreshPresence(fullTarget?: Socket) {
    if (stopping || refreshingPresence) return;
    refreshingPresence = true;
    try {
      const now = Date.now(),
        checked = new Map<string, boolean>();
      const valid = (hash: string, user: string) => {
        const key = `${hash}:${user}`;
        if (!checked.has(key))
          checked.set(
            key,
            !!db.sql
              .prepare(
                "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.user_id=? AND s.expires>? AND u.role='player'",
              )
              .get(hash, user, now),
          );
        return checked.get(key)!;
      };
      const actors = presence.actors(now, valid);
      const recipients = [...io.sockets.sockets.values()].filter((socket) => {
        if (!valid(socket.data.session, socket.data.user)) {
          socket.disconnect(true);
          return false;
        }
        return socket.data.mode === "multi";
      });
      // Simulation ticks change no public names/desk/station coordinates. Avoid
      // rescanning private save JSON each second; successful commands invalidate
      // the small public projection, and new connections fill missing entries.
      if (
        presenceDetailsDirty ||
        actors.some((actor) => !publicPresenceCache.has(actor.id))
      ) {
        publicPresenceCache = new Map(
          readPublicPresence(db, actors).map((player) => [player.id, player]),
        );
        presenceDetailsDirty = false;
      }
      const publicPlayers = actors.flatMap((actor) => {
        const player = publicPresenceCache.get(actor.id);
        return player ? [{ ...player, status: actor.status }] : [];
      });
      const actorIds = new Set(actors.map((actor) => actor.id));
      for (const id of publicPresenceCache.keys())
        if (!actorIds.has(id)) publicPresenceCache.delete(id);
      const changed = presence.reconcile(publicPlayers);
      if (changed)
        for (const socket of recipients) {
          if (socket !== fullTarget)
            for (const frame of changed) socket.emit("presence", frame);
        }
      if (fullTarget && recipients.includes(fullTarget)) {
        for (const frame of presence.snapshot())
          fullTarget.emit("presence", frame);
      }
    } finally {
      refreshingPresence = false;
    }
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
    presence.connect(socket.id, socket.data.user, socket.data.session);
    socket.on(
      "play:presence",
      (input: unknown, ack?: (result: { ok: boolean }) => void) => {
        try {
          const session = auth.session(socket.request.headers.cookie);
          if (!session) {
            socket.disconnect(true);
            return;
          }
          const { active } = z
            .object({ active: z.boolean() })
            .strict()
            .parse(input);
          auth.limit(`play-presence:${socket.id}`, 20, 60000);
          const changed = presence.play(
            socket.id,
            deskOwner(db, session.user_id, "multi"),
            active,
            Date.now(),
          );
          if (changed)
            diagnostics.log(
              "presence",
              active ? "PLAY_ENTER" : "PLAY_LEAVE",
              "info",
              { active },
            );
          if (typeof ack === "function") ack({ ok: true });
        } catch {
          if (typeof ack === "function") ack({ ok: false });
        }
      },
    );
    socket.on("disconnect", (reason) => {
      presence.disconnect(
        socket.id,
        Date.now(),
        reason === "server namespace disconnect",
      );
      diagnostics.log("presence", "PLAY_DISCONNECTED");
      refreshPresence();
    });
    socket.on("presence:sync", () => {
      if (!auth.session(socket.request.headers.cookie))
        return socket.disconnect(true);
      try {
        auth.limit(`presence:${socket.data.user}`, 10, 60000);
        refreshPresence(socket);
      } catch {
        socket.emit(
          "notice",
          "Spielerliste konnte nicht erneut geladen werden.",
        );
      }
    });
    refreshPresence(socket);
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
    view = viewForActor(socket.data.user, peers, socket.data.mode),
  ) {
    if (socket.handshake.auth.routeSnapshots === 1) {
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
    const views = new Map<string, ReturnType<typeof viewForActor>>();
    const viewFor = (actor: string, mode: ReturnType<typeof parseMode>) => {
      const key = JSON.stringify([actor, mode]);
      let view = views.get(key);
      if (!view) {
        view = viewForActor(actor, peers, mode);
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
    refreshPresence();
    return viewFor;
  }
  let last = Date.now();
  const timer = setInterval(() => {
    if (failed || stopping) return;
    const now = Date.now();
    try {
      game.step(Math.max(0, (now - last) / 1000), now);
      recordPlayTime(
        db.sql,
        presence.activeUsers(
          now,
          (session, user) =>
            !!db.sql
              .prepare(
                "SELECT 1 FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND user_id=? AND expires>? AND role='player'",
              )
              .get(session, user, now),
          (user) => deskOwner(db, user, "multi"),
        ),
        Math.max(0, (now - last) / 1000),
      );
      last = now;
      publish();
    } catch {
      failed = true;
      diagnostics.log("simulation", "STORAGE_OR_VALIDATION_FAILED", "error");
      io.emit(
        "notice",
        "Server-Simulation pausiert. Serverbetreiber informieren.",
      );
    }
  }, 1000);
  // Presence/auth expiry also advances when the simulation is paused.
  const presenceTimer = setInterval(() => {
    if (stopping || !failed) return;
    try {
      refreshPresence();
    } catch {
      diagnostics.log("presence", "PRESENCE_REFRESH_FAILED", "error");
    }
  }, 1000);
  let backupJob: Promise<unknown> = Promise.resolve();
  const backupTimer = setInterval(() => {
    backupJob = backupJob
      .then(() => db.backup())
      .catch(() => diagnostics.log("storage", "BACKUP_FAILED", "error"));
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
        diagnostics.log("server", "SERVER_STOPPING");
        clearInterval(timer);
        clearInterval(presenceTimer);
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
        presence.close();
        publicPresenceCache.clear();
        clearTimeout(deadline);
        await Promise.allSettled([...pendingHttp]);
        await backupJob;
        try {
          await db.backup();
        } finally {
          db.close();
          release();
          await geography?.close();
          diagnostics.log("server", "SERVER_STOPPED");
        }
      })()),
  };
}
if (process.argv[1] && /(?:^|[\\/])index\.js$/.test(process.argv[1])) {
  assertInstalledData(root);
  diagnostics.log("server", "BUILD_AND_DATA_VALIDATED");
  const c = config();
  diagnostics.log("server", "CONFIGURATION_VALIDATED", "info", {
    port: c.port,
  });
  const geography = await prepareGeography(c);
  let app: ReturnType<typeof startServer>;
  try {
    app = startServer(c, undefined, geography);
  } catch (error) {
    await geography?.close();
    throw error;
  }
  try {
    await app.listen();
    recordDatabaseReady(root);
  } catch (e) {
    await app.close();
    throw e;
  }
  diagnostics.log("server", "SERVER_READY", "info", { port: c.port });
  if (process.connected)
    process.send?.({ type: "ready", host: c.host, port: c.port });
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void app
      .close()
      .then(() => process.exit(0))
      .catch(() => {
        diagnostics.log("server", "SERVER_STOP_FAILED", "error");
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
