import { listenBrowserServer } from "./server-helper";
import { established } from "./fixtures";
import { generate } from "../../src/engine";
import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { startServer } from "../../server/index";
import type { Cue } from "../../src/audio/synth";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-sound-")),
    port = 0;
  origin = `http://127.0.0.1:${port}`;
  const config = {
    host: "127.0.0.1",
    port,
    publicUrl: origin,
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
});
test.afterAll(async () => {
  await app.close();
});
async function meter(page: Page) {
  await page.addInitScript(() => {
    const win = window as typeof window & {
      audioMeters: { context: AudioContext; analyser: AnalyserNode }[];
    };
    win.audioMeters = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
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
        win.audioMeters.push({ context: this, analyser });
      }
    };
  });
}
async function levels(page: Page) {
  return page.evaluate(() => {
    const m = (
      window as typeof window & {
        audioMeters: { context: AudioContext; analyser: AnalyserNode }[];
      }
    ).audioMeters?.[0];
    if (!m) return { state: "absent", rms: 0, time: 0 };
    const values = new Float32Array(m.analyser.fftSize);
    m.analyser.getFloatTimeDomainData(values);
    return {
      focused: document.hasFocus(),
      visible: document.visibilityState,
      state: m.context.state,
      rms: Math.sqrt(values.reduce((s, n) => s + n * n, 0) / values.length),
      time: m.context.currentTime,
    };
  });
}
async function login(page: Page, ready = false) {
  const name = "audio-" + crypto.randomUUID().slice(0, 8);
  const id = await app.auth.create(
    name,
    "Audio-test-password-123!",
    "Audio",
    "Leitstelle Klang",
  );
  if (ready) {
    const save = established("Audio");
    save.player.id = id;
    save.missionWait = 9999;
    for (const o of [...save.buildings, ...save.vehicles]) o.owner = id;
    app.db.save(id, save);
  }
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(name);
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Audio-test-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.locator(".command-menu").waitFor();
  return id;
}
async function play(page: Page) {
  await page
    .getByRole("button", { name: "Spielen", exact: true })
    .click();
  await expect(page.locator(".radio-bar")).toContainText(
    "Mit Spielserver verbunden",
  );
}
test("echte Audioausgabe startet nach Interaktion, lässt sich stummschalten und speichert getrennte Regler", async ({
  page,
}, info) => {
  await meter(page);
  await login(page);
  expect((await levels(page)).state).toBe("absent");
  await play(page);
  await expect
    .poll(async () => await levels(page))
    .toMatchObject({ state: "running" });
  await expect
    .poll(async () => (await levels(page)).rms)
    .toBeGreaterThan(0.0001);
  await page
    .getByRole("button", { name: "Ton stummschalten", exact: true })
    .click();
  await expect.poll(async () => (await levels(page)).state).toBe("suspended");
  await page
    .getByRole("button", { name: "Ton einschalten", exact: true })
    .click();
  await expect.poll(async () => (await levels(page)).state).toBe("running");
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("slider", { name: "Musiklautstärke" }).focus();
  await page.keyboard.press("Home");
  await page
    .getByRole("checkbox", { name: "Soundeffekte", exact: true })
    .uncheck();
  await expect.poll(async () => (await levels(page)).rms).toBeLessThan(0.0001);
  await page
    .getByRole("checkbox", { name: "Soundeffekte", exact: true })
    .check();
  await page.getByRole("button", { name: "Einsatzsignal anhören" }).click();
  await expect
    .poll(async () => (await levels(page)).rms, { intervals: [20, 30, 40] })
    .toBeGreaterThan(0.001);
  await page.getByRole("slider", { name: "Effektlautstärke" }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.screenshot({
    path: info.outputPath("audio-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({
    path: info.outputPath("audio-desktop-compact.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.locator(".command-menu").waitFor();
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(
    page.getByRole("slider", { name: "Musiklautstärke" }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("slider", { name: "Effektlautstärke" }),
  ).toHaveValue("1");
});
test("nur der aktive Tab spielt und Abmeldung beendet die Ausgabe", async ({
  page,
  context,
}) => {
  await meter(page);
  await login(page);
  await play(page);
  await expect.poll(async () => (await levels(page)).state).toBe("running");
  const other = await context.newPage();
  await meter(other);
  await other.goto(origin);
  await play(other);
  await expect
    .poll(async () => await levels(other))
    .toMatchObject({ state: "running" });
  await expect.poll(async () => (await levels(page)).state).toBe("suspended");
  await page.bringToFront();
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect.poll(async () => (await levels(other)).state).toBe("suspended");
  await expect.poll(async () => (await levels(page)).state).toBe("running");
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect.poll(async () => (await levels(page)).state).toBe("suspended");
  await other.close();
});
test("fehlende Audio-Unterstützung blockiert das Spiel nicht", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeChannel = window.BroadcastChannel;
    window.BroadcastChannel = class extends NativeChannel {
      constructor(name: string) {
        if (name === "lv-audio-focus-v1")
          throw new Error("Audio channel blocked");
        super(name);
      }
    };
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
    });
  });
  await login(page);
  await play(page);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await expect(page.locator(".sound-status")).toContainText("nicht verfügbar");
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
  });
  await page
    .getByRole("checkbox", { name: "Hintergrundmusik", exact: true })
    .uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Hintergrundmusik", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator("svg.map")).toBeVisible();
});
test("Musik und alle Effekte erzeugen messbaren Stereo-Ton ohne Clipping", async ({
  page,
}, info) => {
  const result = await build({
    entryPoints: ["src/audio/synth.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "AudioRender",
    platform: "browser",
  });
  await page.goto("about:blank");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const rendered = await page.evaluate(async () => {
    const lib = (
      window as typeof window & {
        AudioRender: typeof import("../../src/audio/synth");
      }
    ).AudioRender;
    const c = new OfflineAudioContext(
        2,
        Math.ceil(44100 * (264 * lib.BEAT + 3)),
        44100,
      ),
      g = new lib.SoundGraph(c);
    g.volumes(1, 1);
    for (let i = 0; i < 264; i++) g.beat(i, 0.05 + i * lib.BEAT, true);
    const cues: Cue[] = [
      "phone",
      "dme",
      "siren",
      "station",
      "priority",
      "mission",
      "dispatch",
      "arrival",
      "return",
      "complete",
      "level",
      "build",
      "radio",
      "error",
      "click",
    ];
    const checks = [];
    cues.forEach((cue, i) => g.cue(cue, 40 + i * 2));
    for (const cue of cues) {
      const context = new OfflineAudioContext(2, 44100 * 2, 44100),
        graph = new lib.SoundGraph(context);
      graph.volumes(0, 1);
      graph.cue(cue, 0.02);
      const buffer = await context.startRendering(),
        a = buffer.getChannelData(0);
      checks.push({
        cue,
        peak: a.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
        rms: Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length),
      });
    }
    const b = await c.startRendering(),
      left = b.getChannelData(0),
      right = b.getChannelData(1);
    let peak = 0,
      power = 0,
      stereo = 0;
    for (let i = 0; i < left.length; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      power += left[i] * left[i];
      stereo += Math.abs(left[i] - right[i]);
    }
    const previewLength = Math.min(b.length, 44100 * 32);
    const data = new ArrayBuffer(44 + previewLength * 4),
      v = new DataView(data);
    const text = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++)
        v.setUint8(offset + i, s.charCodeAt(i));
    };
    text(0, "RIFF");
    v.setUint32(4, data.byteLength - 8, true);
    text(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, 44100, true);
    v.setUint32(28, 176400, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    text(36, "data");
    v.setUint32(40, previewLength * 4, true);
    for (let i = 0; i < previewLength; i++) {
      v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
      v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
    }
    let binary = "";
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {
      peak,
      rms: Math.sqrt(power / left.length),
      stereo: stereo / left.length,
      checks,
      wav: btoa(binary),
    };
  });
  expect(rendered.peak).toBeLessThan(0.95);
  expect(rendered.rms).toBeGreaterThan(0.005);
  expect(rendered.stereo).toBeGreaterThan(0.0001);
  for (const effect of rendered.checks) {
    expect(effect.peak, effect.cue).toBeLessThan(0.95);
    expect(effect.rms, effect.cue).toBeGreaterThan(0.0005);
  }
  await writeFile(
    info.outputPath("nachtschicht-vorschau.wav"),
    Buffer.from(rendered.wav, "base64"),
  );
  const { wav: _, ...measurements } = rendered;
  void _;
  await info.attach("audio-messwerte", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});

test("ein neuer bestätigter Servereinsatz löst ohne Bedienklick ein hörbares Signal aus", async ({
  page,
}) => {
  await meter(page);
  const id = await login(page, true);
  await play(page);
  // Wait for audible playback before testing a live event: initial/reconnect snapshots
  // are deliberately silent, and Firefox starts its output device asynchronously.
  await expect
    .poll(async () => await levels(page))
    .toMatchObject({ state: "running" });
  await expect
    .poll(async () => (await levels(page)).rms)
    .toBeGreaterThan(0.0001);
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Hintergrundmusik", exact: true })
    .uncheck();
  await expect.poll(async () => (await levels(page)).rms).toBeLessThan(0.0001);
  const s = app.db.all().get(id)!;
  generate(s);
  s.revision++;
  app.db.save(id, s);
  await expect
    .poll(async () => (await levels(page)).rms, {
      intervals: [20, 30, 40],
      timeout: 5000,
    })
    .toBeGreaterThan(0.001);
  await expect.poll(async () => (await levels(page)).rms).toBeLessThan(0.0001);
});
