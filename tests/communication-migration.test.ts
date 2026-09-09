import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  planCommunicationMigration,
  applyCommunicationMigration,
} from "../server/communication-migration";
import { phaseFixture } from "./phase-fixture";
import { transmit } from "../src/simulation/transmissions";
it("versioniert alte Anfragen ohne neue Fahrzeugzuweisung oder Funkwiederholung, Vorschau und Wiederholung bleiben sicher", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE saves(user_id TEXT PRIMARY KEY,data TEXT)");
    const s = phaseFixture("migration-radio");
    delete s.radioNetwork;
    const data = JSON.stringify(s);
    db.prepare("INSERT INTO saves VALUES(?,?)").run(s.player.id, data);
    const plan = planCommunicationMigration(db);
    expect(plan.summary.radio).toBe(1);
    expect(db.prepare("SELECT data FROM saves").get()!.data).toBe(data);
    expect(plan.saves[0].save).toEqual({
      ...s,
      radioNetwork: { version: 1, sequence: 0, entries: [] },
    });
    applyCommunicationMigration(db);
    expect(planCommunicationMigration(db).summary.radio).toBe(0);
    const loaded = planCommunicationMigration(db).saves[0].save;
    transmit(loaded, {
      id: "persisted",
      channel: "Feuerwehr",
      sender: "Florian",
      vehicle: "",
      mission: "",
      text: "Status drei",
      priority: 50,
    });
    db.prepare("UPDATE saves SET data=?").run(JSON.stringify(loaded));
    expect(planCommunicationMigration(db).saves[0].save.radioNetwork).toEqual(
      loaded.radioNetwork,
    );
    db.prepare("UPDATE saves SET user_id=?").run("wrong-owner");
    expect(() => applyCommunicationMigration(db)).toThrow("Kontozuordnung");
    expect(db.prepare("SELECT data FROM saves").get()!.data).toBe(
      JSON.stringify(loaded),
    );
  } finally {
    db.close();
  }
});
