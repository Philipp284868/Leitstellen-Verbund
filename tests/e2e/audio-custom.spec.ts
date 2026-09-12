import { openPanel } from "./ui-navigation";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fresh, type Mission } from "../../src/shared/model";
import { legacyIncident } from "../../src/simulation/incidents";
import { sites as nodes } from "../fixtures/germany/locations";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";

import type { startServer } from "../../src/server/index";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-custom-sound-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
});
test.afterAll(async () => {
  await app.close();
});

type Meters = { context: AudioContext; analyser: AnalyserNode }[];
declare global {
  interface Window {
    customAudioTest: {
      meters: Meters;
      players: HTMLAudioElement[];
      urls: Set<string>;
      fullReads: number;
      pcmDecodes: number;
      sent: string[];
    };
  }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const state = (window.customAudioTest = {
      meters: [] as Meters,
      players: [] as HTMLAudioElement[],
      urls: new Set<string>(),
      fullReads: 0,
      pcmDecodes: 0,
      sent: [] as string[],
    });
    const NativeContext = window.AudioContext,
      NativeAudio = window.Audio;
    window.AudioContext = class extends NativeContext {
      constructor() {
        super();
        const analyser = this.createAnalyser(),
          create = this.createDynamicsCompressor.bind(this);
        analyser.fftSize = 2048;
        this.createDynamicsCompressor = () => {
          const node = create();
          node.connect(analyser);
          return node;
        };
        state.meters.push({ context: this, analyser });
        this.decodeAudioData = () => {
          state.pcmDecodes++;
          throw Error("Full PCM decode forbidden for local recordings");
        };
      }
    };
    window.Audio = class extends NativeAudio {
      constructor() {
        super();
        state.players.push(this);
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL),
      arrayBuffer = Blob.prototype.arrayBuffer;
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      state.urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      state.urls.delete(url);
      revoke(url);
    };
    Blob.prototype.arrayBuffer = function () {
      if (this.size > 16) state.fullReads++;
      return arrayBuffer.call(this);
    };
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (value) {
      state.sent.push(typeof value === "string" ? value : "BINARY PAYLOAD");
      return send.call(this, value);
    };
  });
}
async function meter(page: Page) {
  return page.evaluate(() => {
    const state = window.customAudioTest,
      first = state.meters[0];
    const values = new Float32Array(first?.analyser.fftSize || 2048);
    first?.analyser.getFloatTimeDomainData(values);
    return {
      rms: Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length),
      playing: state.players.filter(
        (p) => !p.paused && p.src.startsWith("blob:"),
      ).length,
      urls: state.urls.size,
      pcm: state.pcmDecodes,
      reads: state.fullReads,
    };
  });
}
async function login(page: Page) {
  await instrument(page);
  const name = "sound-local-" + crypto.randomUUID().slice(0, 8),
    password = "Local-audio-test-123!";
  const id = await app.auth.create(name, password, "Audio", "Leitstelle Audio");
  const save = fresh("Audio", "Leitstelle Audio", Date.now() / 1000);
  save.player.id = id;
  const mission: Mission = {
    id: crypto.randomUUID(),
    template: "bin",
    pos: nodes[0],
    progress: 0,
    phase: "offered",
    created: save.time,
    completed: 0,
    shared: false,
    round: crypto.randomUUID(),
    contributors: [],
    transports: [],
  };
  legacyIncident(save, mission);
  save.missions = [mission];
  save.missionWait = 99999;
  app.db.save(id, save);
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(name);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.locator(".command-menu").waitFor();
  await openPanel(page, "Einstellungen");
  await page
    .getByRole("checkbox", { name: "Musik stummschalten", exact: true })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Leitstellenumgebung stummschalten",
      exact: true,
    })
    .check();
  await page
    .getByText("Signalregler und eigene Soundprofile", { exact: true })
    .click();
  await expect(page.locator(".sound-status")).toContainText("Audio ist aktiv");
  return { id, name, mission: mission.id };
}
function wav(seconds = 18) {
  const samples = 44100 * seconds,
    buffer = Buffer.alloc(44 + samples * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(176400, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 4, 40);
  for (let n = 0; n < samples; n++) {
    const value = Math.round(Math.sin((n * 2 * Math.PI * 440) / 44100) * 10000);
    buffer.writeInt16LE(value, 44 + n * 4);
    buffer.writeInt16LE(value, 46 + n * 4);
  }
  return buffer;
}
const section = (page: Page, channel = "gong") =>
  page.locator(`[data-sound-channel="${channel}"]`);
async function upload(
  page: Page,
  name: string,
  buffer: Buffer,
  channel = "gong",
) {
  await section(page, channel)
    .locator('input[type="file"]')
    .setInputFiles({
      name,
      mimeType: name.endsWith("wav")
        ? "audio/wav"
        : name.endsWith("ogg")
          ? "audio/ogg"
          : "audio/mpeg",
      buffer,
    });
  await expect(page.locator(".sound-profiles > p[role=status]")).toContainText(
    "lokal geprüft",
  );
  await apply(page);
}
async function apply(page: Page) {
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.locator(".settings-actions")).toContainText(
    "Gespeichert auf diesem Gerät",
  );
}
async function logoutFromSettings(page: Page) {
  await apply(page);
  await page.getByRole("tab", { name: "Hinweise & Hilfe" }).click();
  await page
    .getByRole("button", { name: "Konto & Sicherheit", exact: true })
    .click();
  const account = page.getByRole("dialog", { name: "Konto & Sicherheit" });
  await account.getByRole("button", { name: "Abmelden", exact: true }).click();
  await account
    .getByRole("button", { name: "Bestätigen", exact: true })
    .click();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("lv-custom-audio-v1", 2);
      r.onsuccess = () => resolve(r.result);
    });
    const result = await new Promise<
      {
        channel: string;
        name: string;
        bytes: number;
        duration: number;
        enabled: boolean;
      }[]
    >((resolve) => {
      const r = db.transaction("info").objectStore("info").getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return result;
  });
}

test("große lange WAV bleibt lokal, überlebt Reload und lässt sich zuweisen, deaktivieren, ersetzen, stoppen und löschen", async ({
  page,
}) => {
  const account = await login(page),
    requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(origin) && r.method() !== "GET")
      requests.push(`${r.method()} ${r.url()} ${r.postData() || ""}`);
  });
  await page.evaluate(() => {
    window.customAudioTest.sent = [];
  });
  const name = "nur-lokal-gross.wav",
    buffer = wav(24);
  expect(buffer.length).toBeGreaterThan(2 * 1024 * 1024);
  await upload(page, name, buffer);
  expect((await stored(page))[0]).toMatchObject({
    name,
    duration: 24,
    enabled: true,
    bytes: buffer.length,
  });
  await section(page)
    .getByRole("button", { name: "Alarm anhören", exact: true })
    .click();
  await expect.poll(async () => (await meter(page)).playing).toBe(1);
  await expect
    .poll(async () => (await meter(page)).rms)
    .toBeGreaterThan(0.0001);
  await page.getByRole("button", { name: "Eigenen Sound stoppen" }).click();
  await expect
    .poll(async () => await meter(page))
    .toMatchObject({ playing: 0, urls: 0, pcm: 0, reads: 0 });
  await page
    .getByLabel("Vorhandenen Sound für Pieper zuweisen")
    .selectOption("gong");
  await expect(section(page, "pager")).toContainText(name);
  await section(page)
    .getByRole("checkbox", {
      name: "Eigene Datei für Alarm aktiv",
      exact: true,
    })
    .uncheck();
  await apply(page);
  await expect
    .poll(
      async () =>
        (await stored(page)).find((s) => s.channel === "gong")?.enabled,
    )
    .toBe(false);
  await section(page)
    .getByRole("button", { name: "Alarm anhören", exact: true })
    .click();
  await expect
    .poll(async () => (await meter(page)).rms)
    .toBeGreaterThan(0.0001);
  expect((await meter(page)).playing).toBe(0);
  expect(requests).toEqual([]);
  const frames = await page.evaluate(() => window.customAudioTest.sent);
  expect(frames.join(" ")).not.toContain(name);
  expect(frames).not.toContain("BINARY PAYLOAD");
  expect(JSON.stringify(app.db.all().get(account.id))).not.toContain(name);
  await page.reload();
  await page.locator(".command-menu").waitFor();
  await openPanel(page, "Einstellungen");
  await page
    .getByText("Signalregler und eigene Soundprofile", { exact: true })
    .click();
  await expect(
    section(page).getByRole("checkbox", {
      name: "Eigene Datei für Alarm aktiv",
      exact: true,
    }),
  ).not.toBeChecked();
  await section(page)
    .getByRole("checkbox", {
      name: "Eigene Datei für Alarm aktiv",
      exact: true,
    })
    .check();
  await upload(page, "ersatz.wav", wav());
  await expect(section(page)).toContainText("ersatz.wav");
  await section(page)
    .getByRole("button", { name: "Alarm anhören", exact: true })
    .click();
  await expect.poll(async () => (await meter(page)).playing).toBe(1);
  await section(page)
    .getByRole("button", { name: "Datei für Alarm löschen", exact: true })
    .click();
  await apply(page);
  await expect.poll(async () => (await meter(page)).urls).toBe(0);
  expect(
    (await stored(page)).find((s) => s.channel === "gong"),
  ).toBeUndefined();
  expect((await stored(page)).find((s) => s.channel === "pager")?.name).toBe(
    name,
  );
});
for (const format of ["mp3", "ogg"])
  test(`echte lange ${format.toUpperCase()} wird vom Browser dekodiert und als lokale Datei abgespielt`, async ({
    page,
  }) => {
    await login(page);
    await upload(
      page,
      `signal.${format}`,
      await readFile(resolve(`tests/e2e/fixtures/audio/tone.${format}`)),
    );
    expect((await stored(page))[0].duration).toBeGreaterThan(17);
    await section(page)
      .getByRole("button", { name: "Alarm anhören", exact: true })
      .click();
    await expect
      .poll(async () => (await meter(page)).rms)
      .toBeGreaterThan(0.0001);
    await expect.poll(async () => (await meter(page)).playing).toBe(1);
    await page.getByRole("button", { name: "Eigenen Sound stoppen" }).click();
    await expect
      .poll(async () => await meter(page))
      .toMatchObject({ playing: 0, urls: 0, pcm: 0, reads: 0 });
  });

test("Quota- und Codecfehler erhalten den alten Sound und Prioritäts-/Notfallton verdrängen eigene Aufnahmen", async ({
  page,
}) => {
  const account = await login(page);
  await upload(page, "original.wav", wav());
  await section(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "kaputt.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("ID3broken-audio-frame"),
    });
  await expect(page.locator(".sound-profiles > p[role=status]")).toContainText(
    "nicht abspielen",
  );
  expect((await stored(page))[0].name).toBe("original.wav");
  await page.evaluate(() =>
    Object.defineProperty(navigator.storage, "estimate", {
      configurable: true,
      value: async () => ({ quota: 100, usage: 99 }),
    }),
  );
  await section(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "groesser.wav",
      mimeType: "audio/wav",
      buffer: wav(30),
    });
  await expect(page.locator(".sound-profiles > p[role=status]")).toContainText(
    "bisherige Datei bleibt erhalten",
  );
  expect((await stored(page))[0].name).toBe("original.wav");
  await page.evaluate(() => {
    delete (navigator.storage as { estimate?: unknown }).estimate;
  });
  await page
    .getByLabel("Vorhandenen Sound für Funk zuweisen")
    .selectOption("gong");
  await page
    .getByRole("slider", { name: "Sprechwunschlautstärke", exact: true })
    .focus();
  await page.keyboard.press("Home");
  await section(page, "radio")
    .getByRole("button", { name: "Funk anhören", exact: true })
    .click();
  await expect.poll(async () => (await meter(page)).playing).toBe(1);
  const save = app.db.all().get(account.id)!,
    mission = save.missions.find((m) => m.id === account.mission)!;
  mission.control!.priority = "NOTFALL";
  save.revision++;
  app.db.save(account.id, save);
  await expect
    .poll(async () => (await meter(page)).playing, { intervals: [20, 30, 40] })
    .toBe(0);
  await expect
    .poll(async () => (await meter(page)).rms, { intervals: [20, 30, 40] })
    .toBeGreaterThan(0.0001);
  await expect.poll(async () => (await meter(page)).urls).toBe(0);
  expect(
    await section(page, "priority").locator('input[type="file"]').count(),
  ).toBe(0);
  await expect.poll(async () => (await meter(page)).rms).toBeLessThan(0.0001);
  await section(page, "priority")
    .getByRole("button", { name: "Prioritätsalarm anhören" })
    .click();
  await expect
    .poll(async () => (await meter(page)).rms, { intervals: [20, 30, 40] })
    .toBeGreaterThan(0.0001);
  expect((await meter(page)).pcm).toBe(0);
});

test("Tabwechsel und Abmeldung geben lokale Wiedergabequellen frei", async ({
  page,
  context,
}) => {
  await login(page);
  await upload(page, "abmeldung.wav", wav());
  await section(page)
    .getByRole("button", { name: "Alarm anhören", exact: true })
    .click();
  await expect.poll(async () => (await meter(page)).playing).toBe(1);
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await expect
    .poll(async () => await meter(page))
    .toMatchObject({ playing: 0, urls: 0 });
  await other.close();
  await page.bringToFront();
  await section(page)
    .getByRole("button", { name: "Alarm anhören", exact: true })
    .click();
  await expect.poll(async () => (await meter(page)).playing).toBe(1);
  await logoutFromSettings(page);
  await expect
    .poll(async () => await meter(page))
    .toMatchObject({ playing: 0, urls: 0 });
});

test("Dateizuordnungen sind echte Entwürfe: Verwerfen und Schließen bewahren die gespeicherte Originaldatei", async ({
  page,
}) => {
  await login(page);
  await upload(page, "gespeichert.wav", wav());
  await section(page)
    .getByRole("checkbox", {
      name: "Eigene Datei für Alarm aktiv",
      exact: true,
    })
    .uncheck();
  await expect(page.locator(".settings-actions")).toContainText(
    "Ungespeicherte Vorschau",
  );
  expect((await stored(page))[0].enabled).toBe(true);
  await page.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(
    section(page).getByRole("checkbox", {
      name: "Eigene Datei für Alarm aktiv",
      exact: true,
    }),
  ).toBeChecked();
  await section(page)
    .getByRole("button", { name: "Datei für Alarm löschen", exact: true })
    .click();
  await expect(section(page)).toContainText("Originalsignal");
  expect((await stored(page))[0].name).toBe("gespeichert.wav");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  await openPanel(page, "Einstellungen");
  await page
    .getByText("Signalregler und eigene Soundprofile", { exact: true })
    .click();
  await expect(section(page)).toContainText("gespeichert.wav");
  expect((await stored(page))[0].enabled).toBe(true);
});
