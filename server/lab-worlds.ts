// Development only: use exactly the production coordinator in a transient SQLite database.
import type { Save } from "../src/model";
import { missionSchema } from "../src/model";
import { Database } from "./database";
import { Game } from "./game";
export function stepLaboratoryWorlds(saves: Save[], seconds: number) {
  const db = new Database("", { memory: true });
  try {
    for (const s of saves) {
      db.sql
        .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
        .run(s.player.id, s.player.id, "offline-lab-no-login", "player", 0);
      db.save(s.player.id, s);
    }
    new Game(db).step(seconds, (saves[0].time + seconds) * 1000, {
      generation: false,
    });
    const result = db.all();
    for (const [owner, s] of result)
      s.archive = db.sql
        .prepare(
          "SELECT data FROM mission_history WHERE owner=? AND mode='multi' ORDER BY completed DESC,id DESC",
        )
        .all(owner)
        .map((row) => missionSchema.parse(JSON.parse(String(row.data))));
    return saves.map((s) => result.get(s.player.id)!);
  } finally {
    db.close();
  }
}
