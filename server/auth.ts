import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Database } from "./database";
import { fresh } from "../src/model";

export const token = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_-]+$/);
export const passwordSchema = z.string().min(12).max(128);
let hashing = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (hashing >= 4)
    throw Error("Anmeldung ausgelastet. Bitte später erneut versuchen.");
  hashing++;
  try {
    return await new Promise((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 },
        (err, result) => (err ? reject(err) : resolve(result)),
      ),
    );
  } finally {
    hashing--;
  }
}
export async function passwordHash(password: string) {
  passwordSchema.parse(password);
  const salt = token();
  return `scrypt-65536-8-1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, encodedHash] = encoded.split(":");
  if (scheme !== "scrypt-65536-8-1" || !salt || !encodedHash) return false;
  const actual = await derive(password, salt),
    expected = Buffer.from(encodedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export interface Session {
  hash: string;
  user_id: string;
  csrf: string;
  expires: number;
  role: "admin" | "player";
  username: string;
}
export class Auth {
  constructor(public db: Database) {}
  limit(key: string, max = 10, window = 900000) {
    const now = Date.now(),
      k = hash(key);
    const row = this.db.sql
      .prepare("SELECT count,until_at FROM limits WHERE key=?")
      .get(k);
    if (row && Number(row.until_at) > now) {
      if (Number(row.count) >= max)
        throw Error("Zu viele Versuche. Bitte später erneut versuchen.");
      this.db.sql.prepare("UPDATE limits SET count=count+1 WHERE key=?").run(k);
    } else
      this.db.sql
        .prepare(
          "INSERT INTO limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until_at=excluded.until_at",
        )
        .run(k, 1, now + window);
  }
  async create(
    username: string,
    password: string,
    name: string,
    station: string,
    invite?: string,
    firstAdmin = false,
  ) {
    const user = usernameSchema.parse(username),
      pass = await passwordHash(password);
    return this.db.transaction(() => {
      const now = Date.now();
      if (firstAdmin) {
        if (this.db.sql.prepare("SELECT id FROM users LIMIT 1").get())
          throw Error("Erstadministrator wurde bereits eingerichtet.");
      } else {
        const i = this.db.sql
          .prepare("SELECT * FROM invites WHERE hash=?")
          .get(hash(invite || ""));
        if (!i || i.used || Number(i.expires) <= now)
          throw Error("Einladung ungültig, verwendet oder abgelaufen.");
        this.db.sql
          .prepare("UPDATE invites SET used=1 WHERE hash=?")
          .run(hash(invite!));
      }
      const save = fresh(name, station, now / 1000),
        id = save.player.id;
      this.db.sql
        .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
        .run(id, user, pass, firstAdmin ? "admin" : "player", now);
      this.db.save(id, save);
      this.db.audit(
        id,
        firstAdmin ? "first-admin-created" : "invitation-registered",
      );
      return id;
    });
  }
  invite(actor: string) {
    const value = token();
    this.db.sql
      .prepare("INSERT INTO invites(hash,expires) VALUES (?,?)")
      .run(hash(value), Date.now() + 3 * 86400000);
    this.db.audit(actor, "invitation-created");
    return value;
  }
  session(cookie = ""): Session | null {
    const raw = cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("lv_session="))
      ?.slice(11);
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    return (
      (this.db.sql
        .prepare(
          "SELECT sessions.*,users.role,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires>?",
        )
        .get(hash(raw), Date.now()) as unknown as Session) || null
    );
  }
  issue(id: string) {
    const value = token(),
      csrf = token();
    this.db.sql
      .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
      .run(hash(value), id, csrf, Date.now() + 7 * 86400000);
    return { value, csrf };
  }
}
