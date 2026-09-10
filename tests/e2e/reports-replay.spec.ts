import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";
import { generate } from "../../src/engine";
import { attachIncident } from "../../src/simulation/calls";
import { attachDynamics } from "../../src/simulation/dynamics";
import { completedSave } from "../reports-replay-fixture";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import { enterGame, showIncidents } from "./ui-navigation";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Phase-five-browser-password-123!";
test.use({ actionTimeout: 15000 });
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-phase5-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("reports", password, "Nord", "Nord");
  const s = completedSave(owner);
  s.missionWait = 210;
  app.db.save(owner, s);
});
test.afterEach(async () => {
  await app.close();
});
async function enter(page: Page) {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("reports");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await enterGame(page);
}
test("Bericht, CSV/JSON, Replay, Statistik und Wiederverbindungsübersicht überstehen einen Serverneustart", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.keyboard.press("h");
  await page
    .getByRole("button", { name: "Verlauf ansehen", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Einsatzbericht",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const before = JSON.stringify(app.db.all().get(owner)!.archive[0]);
  await page
    .getByRole("button", { name: "Nächstes Ereignis", exact: true })
    .click();
  const replay = page.getByRole("region", {
    name: "Einsatz-Replay",
    exact: true,
  });
  await expect(replay.locator("output")).toContainText("2 /");
  await page
    .getByRole("button", { name: "Replay abspielen", exact: true })
    .click();
  await expect(replay.locator("output")).not.toContainText("2 /");
  await page
    .getByRole("button", { name: "Wiedergabe pausieren", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Bericht als JSON", exact: true })
    .click();
  const file = await download,
    doc = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(doc.report.credits).toBe(625000);
  expect(JSON.stringify(doc)).not.toContain('"secret"');
  const csvDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Bericht als CSV", exact: true })
    .click();
  expect(await readFile((await (await csvDownload).path())!, "utf8")).toContain(
    "Eigene erfasste km",
  );
  expect(JSON.stringify(app.db.all().get(owner)!.archive[0])).toBe(before);
  await page.screenshot({
    path: info.outputPath("phase5-bericht-replay.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(panel).toBeVisible();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(panel.locator("dd").first()).toHaveCSS("color", "rgb(0, 0, 0)");
  expect(
    await page
      .locator(".incident-history ol")
      .evaluate((list) => list.clientHeight >= list.scrollHeight),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("phase5-druckansicht.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.keyboard.press("h");
  await page.getByRole("button", { name: "Statistiken", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Deine Leitstelle in Zahlen" }),
  ).toBeVisible();
  await page.goto("about:blank");
  const s = app.db.all().get(owner)!;
  generate(s);
  attachIncident(s, s.missions.at(-1)!);
  attachDynamics(s, s.missions.at(-1)!);
  s.revision++;
  app.db.save(owner, s);
  const savedReport = s.archive[0].report;
  await app.close();
  app = await createBrowserServer(compiled.startServer, config);
  await app.listen();
  await page.goto(config.publicUrl);
  await enterGame(page);
  await expect(page.locator(".reconnect-summary")).toContainText("1 Notrufe");
  expect(app.db.all().get(owner)!.archive[0].report).toEqual(savedReport);
  expect(errors).toEqual([]);
});

test("Arbeitsplatzlayout, Filter und sichere Tastenkürzel funktionieren auf Desktop und kleinem Desktopfenster", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const s = app.db.all().get(owner)!;
  generate(s);
  attachIncident(s, s.missions[0]);
  app.db.save(owner, s);
  await enter(page);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("tab", { name: "Steuerung", exact: true }).click();
  await page.getByLabel("Einsatzspalte", { exact: true }).selectOption("right");
  await page
    .getByLabel("Breite der Einsatzspalte", { exact: true })
    .selectOption("380");
  await page.getByLabel("Kompakte Einsatzkarten", { exact: true }).check();
  await page
    .getByLabel("Taste: Archiv und Statistik", { exact: true })
    .fill("z");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Alle Änderungen gespeichert." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await showIncidents(page);
  const side = await page.locator(".mission-sidebar").boundingBox(),
    map = await page.locator(".map-column").boundingBox();
  expect(side!.x).toBeGreaterThan(map!.x);
  expect(side!.width).toBeCloseTo(380, 0);
  expect(
    (await page.locator("[data-testid=germany-map-viewport]").boundingBox())!
      .height,
  ).toBeGreaterThanOrEqual(200);
  await page
    .getByText("Suchen, filtern und sortieren", { exact: true })
    .click();
  await page.getByLabel("Einsätze durchsuchen", { exact: true }).fill("z");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".mission-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Filter zurücksetzen", exact: true })
    .click();
  await expect(page.locator(".mission-card")).toHaveCount(1);
  await page.keyboard.press("z");
  await expect(
    page.getByRole("button", { name: "Statistiken", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("phase5-arbeitsplatz.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await showIncidents(page);
  await expect(page.locator(".mission-card")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("phase5-desktop-compact.png"),
    fullPage: true,
  });
  await page.reload();
  await enterGame(page);
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "right");
  await page.keyboard.press("z");
  await expect(
    page.getByRole("button", { name: "Statistiken", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Eigene Audiodatei wird wirklich abgespielt, explizit gespeichert und nach Neuladen zurückgesetzt", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const w = window as typeof window & { playedCustom: number[] };
    w.playedCustom = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      createMediaElementSource(player: HTMLMediaElement) {
        const source = super.createMediaElementSource(player);
        player.addEventListener("playing", () =>
          w.playedCustom.push(player.duration),
        );
        return source;
      }
    };
  });
  await enter(page);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  await page
    .getByText("Signalregler und eigene Soundprofile", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ruhige Nachtschicht", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Gesamtlautstärke" }),
  ).toHaveValue("75");
  const samples = 11025,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(30000 * Math.sin((i * Math.PI * 2 * 440) / 44100)),
      44 + i * 2,
    );
  await expect(
    page.getByLabel("Datei für Funk", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Datei für Funk", { exact: true }).setInputFiles({
    name: "mein-funk.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await expect(
    page.locator("details.sound-profiles").filter({
      has: page.getByText("Signalregler und eigene Soundprofile", {
        exact: true,
      }),
    }),
  ).toContainText("eigene Datei lokal geprüft und zugeordnet");
  await expect(page.locator(".settings-actions")).toContainText(
    "Ungespeicherte Vorschau",
  );
  await page.getByRole("button", { name: "Funk anhören", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { playedCustom: number[] }).playedCustom
            .length,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() =>
      (window as typeof window & { playedCustom: number[] }).playedCustom.at(
        -1,
      ),
    ),
  ).toBeCloseTo(0.25);
  await page.getByRole("slider", { name: "Funklautstärke" }).focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("button", { name: "Funk anhören", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.locator(".settings-actions")).toContainText(
    "Gespeichert auf diesem Gerät",
  );
  await page.screenshot({
    path: info.outputPath("phase5-soundprofile.png"),
    fullPage: true,
  });
  await page.reload();
  await enterGame(page);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  await page
    .getByText("Signalregler und eigene Soundprofile", { exact: true })
    .click();
  await expect(
    page.locator("details.sound-profiles").filter({
      has: page.getByText("Signalregler und eigene Soundprofile", {
        exact: true,
      }),
    }),
  ).toContainText("mein-funk.wav");
  await expect(
    page.getByRole("slider", { name: "Funklautstärke" }),
  ).toHaveValue("0");
  await page
    .getByRole("button", { name: "Datei für Funk löschen", exact: true })
    .click();
  await expect(
    page.locator("details.sound-profiles").filter({
      has: page.getByText("Signalregler und eigene Soundprofile", {
        exact: true,
      }),
    }),
  ).toContainText("Originalsignal ausgewählt");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(
    page.locator("details.sound-profiles").filter({
      has: page.getByText("Signalregler und eigene Soundprofile", {
        exact: true,
      }),
    }),
  ).not.toContainText("mein-funk.wav");
  await expect(page.locator(".settings-actions")).toContainText(
    "Gespeichert auf diesem Gerät",
  );
  await expect(
    page.getByLabel("Datei für Funk", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Datei für Funk", { exact: true }).setInputFiles({
    name: "fake.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not audio"),
  });
  await expect(
    page.locator("details.sound-profiles").filter({
      has: page.getByText("Signalregler und eigene Soundprofile", {
        exact: true,
      }),
    }),
  ).toContainText("Bitte eine gültige WAV-");
});
