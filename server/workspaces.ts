import type { Database } from "./database";
import type { GameMode } from "../src/mode";
import type { ServerAction } from "./actions";
export const deskOwner = (db: Database, user: string, mode: GameMode) =>
  mode === "single"
    ? user
    : String(
        db.sql
          .prepare("SELECT owner_id FROM desk_members WHERE user_id=?")
          .get(user)?.owner_id ?? user,
      );
export function workspace(db: Database, user: string, mode: GameMode) {
  const owner = deskOwner(db, user, mode);
  const members =
    mode === "single"
      ? []
      : db.sql
          .prepare(
            "SELECT users.id,users.username FROM users WHERE id=? OR id IN (SELECT user_id FROM desk_members WHERE owner_id=?)",
          )
          .all(owner, owner)
          .map((r) => ({ id: String(r.id), name: String(r.username) }));
  const invitations =
    mode === "single"
      ? []
      : db.sql
          .prepare(
            "SELECT owner_id,username FROM desk_invites JOIN users ON users.id=owner_id WHERE user_id=?",
          )
          .all(user)
          .map((r) => ({
            owner: String(r.owner_id),
            name: String(r.username),
          }));
  const outgoing =
    mode !== "multi" || owner !== user
      ? []
      : db.sql
          .prepare(
            "SELECT user_id,username FROM desk_invites JOIN users ON users.id=user_id WHERE owner_id=?",
          )
          .all(owner)
          .map((r) => ({ id: String(r.user_id), name: String(r.username) }));
  return { owner, members, invitations, outgoing, canManage: owner === user };
}
export function membership(
  db: Database,
  user: string,
  a: ServerAction,
  mode: GameMode,
) {
  if (!a.type.startsWith("member-")) return false;
  if (mode !== "multi")
    throw Error("Leitstellenmitglieder sind nur im Multiplayer verfügbar.");
  const owner = deskOwner(db, user, mode);
  if (a.type === "member-invite") {
    if (owner !== user)
      throw Error("Nur der Leitstelleninhaber kann Mitglieder einladen.");
    const target = db.sql
      .prepare("SELECT id FROM users WHERE username=?")
      .get(a.username.trim().toLowerCase());
    if (!target || target.id === user)
      throw Error("Anderes bestehendes Spielerkonto erforderlich.");
    if (
      db.sql
        .prepare("SELECT 1 FROM desk_members WHERE user_id=?")
        .get(target.id)
    )
      throw Error("Konto gehört bereits einer Leitstelle an.");
    if (
      (db.sql
        .prepare("SELECT COUNT(*) AS n FROM desk_invites WHERE owner_id=?")
        .get(user)!.n as number) >= 12
    )
      throw Error("Zu viele offene Einladungen.");
    db.sql
      .prepare("INSERT OR IGNORE INTO desk_invites VALUES (?,?)")
      .run(target.id, user);
  } else if (a.type === "member-accept") {
    if (
      [...db.all("multi").values()].some((s) =>
        s.aid.some(
          (r) =>
            (r.owner === user || r.peer === user) &&
            !["DONE", "DECLINED", "CANCELLED"].includes(r.state),
        ),
      )
    )
      throw Error(
        "Offene Unterstützungsanfragen vor einem Leitstellenwechsel beenden.",
      );
    if (
      !db.sql
        .prepare("SELECT 1 FROM desk_invites WHERE user_id=? AND owner_id=?")
        .get(user, a.owner)
    )
      throw Error("Keine eigene Einladung vorhanden.");
    if (
      db.sql
        .prepare("SELECT 1 FROM desk_members WHERE user_id=? OR owner_id=?")
        .get(user, user) ||
      deskOwner(db, a.owner, mode) !== a.owner
    )
      throw Error("Vorhandene Mitgliedschaft zuerst beenden.");
    const count = Number(
      db.sql
        .prepare("SELECT COUNT(*) AS n FROM desk_members WHERE owner_id=?")
        .get(a.owner)!.n,
    );
    if (count >= 7) throw Error("Maximal acht Disponenten je Leitstelle.");
    db.sql.prepare("INSERT INTO desk_members VALUES (?,?)").run(user, a.owner);
    db.sql.prepare("DELETE FROM desk_invites WHERE user_id=?").run(user);
  } else if (a.type === "member-remove") {
    if (a.user === user)
      db.sql.prepare("DELETE FROM desk_members WHERE user_id=?").run(user);
    else {
      if (owner !== user)
        throw Error("Nur der Inhaber kann Mitglieder entfernen.");
      db.sql
        .prepare("DELETE FROM desk_members WHERE user_id=? AND owner_id=?")
        .run(a.user, user);
      db.sql
        .prepare("DELETE FROM desk_invites WHERE user_id=? AND owner_id=?")
        .run(a.user, user);
    }
  }
  db.audit(user, a.type);
  return true;
}
