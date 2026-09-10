import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { SoundPreferences } from "../../src/audio/preferences";
import type { Cue, SoundGraph } from "../../src/audio/synth";
import { expect, test, type Page } from "./test";
type Lab = typeof import("./fixtures/audio/lab");
declare global {
  interface Window {
    AudioLab: Lab;
    audioLab: {
      contexts: AudioContext[];
      meter: AnalyserNode;
      stream: MediaStreamAudioDestinationNode;
      players: HTMLAudioElement[];
      urls: Set<string>;
      decodes: number;
      reads: number;
      cleanup: () => void;
      error: string;
    };
  }
}
let server: Server, origin: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ["tests/e2e/fixtures/audio/lab.ts"],
    bundle: true,
    format: "iife",
    globalName: "AudioLab",
    platform: "browser",
    write: false,
  });
  server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/lab.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(result.outputFiles[0].text);
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(
      `<!doctype html><meta charset="utf-8"><title>Audio mixing acceptance fixture</title><button id="activate">Audio aktivieren</button><input id="file" type="file"><output id="result"></output><script src="/lab.js"></script><script>window.audioLab.cleanup=window.AudioLab.audio.listen(); window.AudioLab.audio.session(true,'audio-fixture-account'); document.querySelector('#activate').onclick=()=>window.AudioLab.audio.unlock(); document.querySelector('#file').onchange=async(e)=>{try{await window.AudioLab.audio.setCustom('gong',e.target.files[0]);document.querySelector('#result').textContent='Datei geprüft';}catch(error){document.querySelector('#result').textContent=String(error);}};</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Audio test server address missing");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const state = (window.audioLab = {
      contexts: [] as AudioContext[],
      meter: null! as AnalyserNode,
      stream: null! as MediaStreamAudioDestinationNode,
      players: [] as HTMLAudioElement[],
      urls: new Set<string>(),
      decodes: 0,
      reads: 0,
      cleanup: () => {},
      error: "",
    });
    const Context = window.AudioContext,
      AudioElement = window.Audio;
    window.AudioContext = class extends Context {
      constructor() {
        super();
        state.contexts.push(this);
        state.meter = this.createAnalyser();
        state.meter.fftSize = 2048;
        state.stream = this.createMediaStreamDestination();
        const create = this.createDynamicsCompressor.bind(this);
        this.createDynamicsCompressor = () => {
          const node = create();
          node.connect(state.meter);
          node.connect(state.stream);
          return node;
        };
        this.decodeAudioData = () => {
          state.decodes++;
          throw Error("No full PCM decode of custom files");
        };
      }
    };
    window.Audio = class extends AudioElement {
      constructor() {
        super();
        state.players.push(this);
      }
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL),
      read = Blob.prototype.arrayBuffer;
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
      if (this.size > 16) state.reads++;
      return read.call(this);
    };
  });
}
async function open(page: Page) {
  await instrument(page);
  await page.goto(origin);
}
async function active(page: Page) {
  await page.getByRole("button", { name: "Audio aktivieren" }).click();
  await expect
    .poll(() => page.evaluate(() => window.AudioLab.audio.state().status))
    .toBe("playing");
}
async function preferences(page: Page, change: Partial<SoundPreferences>) {
  await page.evaluate(
    (change) =>
      window.AudioLab.audio.previewPreferences({
        ...window.AudioLab.audio.state().preferences,
        ...change,
      }),
    change,
  );
}
async function stats(page: Page) {
  return page.evaluate(() => {
    const state = window.audioLab,
      controller = window.AudioLab.audio as unknown as {
        graph: SoundGraph | null;
        voices: Map<
          string,
          {
            id: string;
            cue: Cue;
            group: string;
            radio: string;
            custom: boolean;
          }
        >;
      };
    const data = new Float32Array(state.meter?.fftSize ?? 2048);
    state.meter?.getFloatTimeDomainData(data);
    return {
      status: window.AudioLab.audio.state().status,
      contexts: state.contexts.length,
      rms: Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length),
      players: state.players.filter((p) => !p.paused).length,
      urls: state.urls.size,
      reads: state.reads,
      decodes: state.decodes,
      ducks: controller.graph?.mixer.duckCount ?? 0,
      musicDuck: controller.graph?.mixer.musicDuck.gain.value ?? 1,
      musicGain: controller.graph?.mixer.groups.music.gain.value ?? 0,
      menuGain: controller.graph?.musicLayers.menu.gain.value ?? 0,
      gameGain: controller.graph?.musicLayers.game.gain.value ?? 0,
      voices: [...(controller.voices?.values() ?? [])].map(
        ({ id, cue, group, radio, custom }) => ({
          id,
          cue,
          group,
          radio,
          custom,
        }),
      ),
      queue: window.AudioLab.audio.state().queuedVoices,
    };
  });
}
function wav(seconds = 18) {
  const n = 44100 * seconds,
    b = Buffer.alloc(44 + n * 4);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(176400, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const value = Math.round(
      Math.sin((i * 2 * Math.PI * 523.25) / 44100) * 10000,
    );
    b.writeInt16LE(value, 44 + i * 4);
    b.writeInt16LE(value, 46 + i * 4);
  }
  return b;
}
async function upload(page: Page) {
  await page.locator("#file").setInputFiles({
    name: "eigenes-langes-signal.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.locator("#result")).toHaveText("Datei geprüft");
}

test("ein Kontext mischt Musik, Umgebung, Telefon und mehrere Instanzen derselben lokalen Datei; Aufnahme und Cleanup", async ({
  page,
}, info) => {
  await open(page);
  expect((await stats(page)).contexts).toBe(0);
  await active(page);
  await upload(page);
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") sent.push(r.url());
  });
  await page.evaluate(() => {
    window.AudioLab.audio.cue("station", { id: "alarm-1" });
    window.AudioLab.audio.cue("station", { id: "alarm-2" });
    window.AudioLab.audio.cue("station", { id: "alarm-3" });
    window.AudioLab.audio.cue("phone", { id: "ring" });
  });
  await expect.poll(async () => (await stats(page)).players).toBe(3);
  const state = await stats(page);
  expect(state.contexts).toBe(1);
  expect(state.voices.filter((v) => v.group === "alarm")).toHaveLength(3);
  expect(state.voices.some((v) => v.group === "ambience")).toBe(true);
  expect(state.musicGain).toBeGreaterThan(0);
  expect(state.ducks).toBeGreaterThan(0);
  expect(state.reads).toBe(0);
  expect(state.decodes).toBe(0);
  await expect
    .poll(async () => (await stats(page)).rms)
    .toBeGreaterThan(0.0001);
  const recording = await page.evaluate(async () => {
    const recorder = new MediaRecorder(window.audioLab.stream.stream),
      chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const ready = new Promise<Blob>(
      (resolve) =>
        (recorder.onstop = () =>
          resolve(new Blob(chunks, { type: recorder.mimeType }))),
    );
    recorder.start();
    window.AudioLab.audio.cue("phone");
    window.AudioLab.audio.cue("dme");
    window.AudioLab.audio.cue("radioAck");
    await new Promise((resolve) => setTimeout(resolve, 2200));
    recorder.stop();
    const blob = await ready;
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  });
  const file = info.outputPath("echte-mehrkanalaufnahme.webm");
  await writeFile(file, Buffer.from(recording.split(",")[1], "base64"));
  await info.attach("Echte gemischte Audioausgabe", {
    path: file,
    contentType: recording.slice(5, recording.indexOf(";")),
  });
  await page.evaluate(() => window.AudioLab.audio.stopCustom());
  await expect.poll(async () => (await stats(page)).urls).toBe(0);
  expect(sent).toEqual([]);
  await page.evaluate(() => window.audioLab.cleanup());
  await expect.poll(async () => (await stats(page)).status).toBe("paused");
  expect((await stats(page)).players).toBe(0);
});
test("sämtliche Fahrzeugkanäle laufen am Arbeitsplatz nacheinander; Notfall erhält unterbrochene Meldungen", async ({
  page,
}) => {
  await open(page);
  await active(page);
  await upload(page);
  await page.evaluate(async () => {
    await window.AudioLab.audio.assignCustom("gong", "radio");
    window.AudioLab.audio.cue("radio", { id: "r1", radio: "dispatch" });
    window.AudioLab.audio.cue("radio", { id: "r2", radio: "support" });
  });
  await expect.poll(async () => (await stats(page)).players).toBe(1);
  expect((await stats(page)).queue).toBe(1);
  await page.evaluate(() => window.AudioLab.audio.stopCustom());
  await expect
    .poll(async () => (await stats(page)).voices.some((v) => v.id === "r2"))
    .toBe(true);
  await page.evaluate(() => window.AudioLab.audio.stopCustom());
  await preferences(page, { parallelRadio: true });
  await page.evaluate(() => {
    window.AudioLab.audio.cue("radio", { id: "r3", radio: "dispatch" });
    window.AudioLab.audio.cue("radio", { id: "r4", radio: "support" });
    window.AudioLab.audio.cue("radio", { id: "r5", radio: "dispatch" });
  });
  await expect.poll(async () => (await stats(page)).players).toBe(1);
  expect((await stats(page)).queue).toBe(2);
  await page.evaluate(() =>
    window.AudioLab.audio.cue("emergency", { id: "critical" }),
  );
  await expect
    .poll(async () => (await stats(page)).players, { intervals: [20, 30] })
    .toBe(0);
  expect((await stats(page)).queue).toBe(3);
  expect((await stats(page)).voices.some((v) => v.cue === "emergency")).toBe(
    true,
  );
  await expect
    .poll(async () => (await stats(page)).rms, { intervals: [20, 30] })
    .toBeGreaterThan(0.0001);
  await expect.poll(async () => (await stats(page)).urls).toBe(0);
  expect(
    await page.evaluate(() => window.AudioLab.audio.state().interrupted),
  ).toContain("r3");
  await expect
    .poll(async () => (await stats(page)).voices.some((v) => v.id === "r3"))
    .toBe(true);
  expect(
    (await stats(page)).voices.filter((v) => v.group === "radio"),
  ).toHaveLength(1);
  await page.evaluate(() =>
    window.AudioLab.audio.cue("phone", { id: "parallel-phone" }),
  );
  await expect
    .poll(async () =>
      (await stats(page)).voices.some((v) => v.group === "phone"),
    )
    .toBe(true);
  expect(
    (await stats(page)).voices.filter((v) => v.group === "radio"),
  ).toHaveLength(1);
});
test("überlappende Gespräche halten Ducking bis zum letzten Ende, Regler und Szenenwechsel bleiben unabhängig", async ({
  page,
}) => {
  await open(page);
  await active(page);
  await page.evaluate(() =>
    window.AudioLab.audio.communications([], ["call-one", "call-two"]),
  );
  await expect
    .poll(async () => (await stats(page)).musicDuck)
    .toBeCloseTo(0.24, 2);
  await preferences(page, { musicVolume: 11 });
  await page.evaluate(() =>
    window.AudioLab.audio.communications([], ["call-two"]),
  );
  expect((await stats(page)).ducks).toBe(1);
  await expect
    .poll(async () => (await stats(page)).musicGain)
    .toBeCloseTo(0.11, 2);
  await page.evaluate(() => window.AudioLab.audio.communications([], []));
  await expect
    .poll(async () => (await stats(page)).musicDuck)
    .toBeCloseTo(1, 2);
  await page.evaluate(() => window.AudioLab.audio.scene(true));
  // A single AudioParam read can expose the newly scheduled endpoint before
  // both audio-thread ramps finish. Verify both channels in the same snapshot.
  await expect(async () => {
    const state = await stats(page);
    expect(state.gameGain).toBeCloseTo(1, 2);
    expect(state.menuGain).toBeCloseTo(0, 2);
  }).toPass({ timeout: 5000 });
  await preferences(page, { music: false });
  await page.evaluate(() => {
    window.AudioLab.audio.scene(false);
    window.AudioLab.audio.scene(true);
  });
  await expect.poll(async () => (await stats(page)).musicGain).toBe(0);
  await page.evaluate(() => window.AudioLab.audio.preview("musicMenu"));
  expect((await stats(page)).voices.some((v) => v.group === "music")).toBe(
    false,
  );
  await preferences(page, { music: true });
  await page.evaluate(() => window.AudioLab.audio.preview("musicMenu"));
  await expect
    .poll(async () =>
      (await stats(page)).voices.some((v) => v.cue === "musicMenu"),
    )
    .toBe(true);
  await page.evaluate(() => window.AudioLab.audio.stopPreview());
  expect((await stats(page)).voices.some((v) => v.group === "music")).toBe(
    false,
  );
  expect((await stats(page)).contexts).toBe(1);
});

test("hängende lokale Sprachausgabe gibt den Funk frei und verwendet niemals eine Netzstimme", async ({
  page,
}) => {
  await open(page);
  await active(page);
  await page.evaluate(() => {
    const probe = {
      spoken: [] as { text: string; local: boolean }[],
      cancelled: 0,
    };
    Object.defineProperty(window, "speechProbe", { value: probe });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [
          { lang: "de-DE", localService: false, name: "Remote" },
          { lang: "de-DE", localService: true, name: "Local" },
        ],
        speak: (u: SpeechSynthesisUtterance) =>
          probe.spoken.push({ text: u.text, local: u.voice!.localService }),
        cancel: () => {
          probe.cancelled++;
        },
      },
    });
    window.AudioLab.audio.cue("radioOpen", {
      id: "stalled-speech",
      text: "Erste Meldung",
    });
    window.AudioLab.audio.cue("radioOpen", {
      id: "next-speech",
      radio: "support",
      text: "Zweite Meldung",
    });
  });
  const probe = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            speechProbe: {
              spoken: { text: string; local: boolean }[];
              cancelled: number;
            };
          }
        ).speechProbe,
    );
  await expect.poll(async () => (await probe()).spoken.length).toBe(1);
  await expect
    .poll(async () => (await probe()).spoken.length, { timeout: 35000 })
    .toBe(2);
  expect((await probe()).spoken.every((u) => u.local)).toBe(true);
  expect((await probe()).cancelled).toBeGreaterThanOrEqual(1);
  expect(
    (await stats(page)).voices.filter((v) => v.group === "radio"),
  ).toHaveLength(1);
  expect(
    await page.evaluate(() => window.AudioLab.audio.state().error),
  ).toContain("Zeitlimit");
  await page.evaluate(() => window.AudioLab.audio.session(false));
  expect((await probe()).cancelled).toBeGreaterThanOrEqual(2);
});
test("Hintergrundwahl und Mehrfachtab-Lease verhindern doppelte Ausgabe und geben Quellen beim Logout frei", async ({
  page,
  context,
}) => {
  await open(page);
  await active(page);
  await preferences(page, { background: "continue" });
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  expect((await stats(page)).status).toBe("playing");
  await instrument(other);
  await other.goto(origin);
  await active(other);
  await expect.poll(async () => (await stats(page)).status).toBe("paused");
  expect((await stats(other)).status).toBe("playing");
  await page.bringToFront();
  await active(page);
  await expect.poll(async () => (await stats(other)).status).toBe("paused");
  await preferences(page, { background: "communications" });
  await other.bringToFront();
  // A tab with no user gesture after losing ownership does not silently steal it back.
  await page.bringToFront();
  await active(page);
  const blank = await context.newPage();
  await blank.goto("about:blank");
  await blank.bringToFront();
  // Headless Chromium keeps every page logically focused. Exercise the real lifecycle handler explicitly.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(async () => (await stats(page)).musicGain).toBe(0);
  await page.evaluate(() => window.AudioLab.audio.cue("phone"));
  await expect
    .poll(async () => (await stats(page)).rms)
    .toBeGreaterThan(0.0001);
  await page.evaluate(() => window.AudioLab.audio.session(false));
  await expect.poll(async () => (await stats(page)).status).toBe("paused");
  expect((await stats(page)).urls).toBe(0);
  await other.close();
  await blank.close();
});

test("beide vollständigen Musikarrangements und sämtliche Erzeuger liefern unterschiedliche, begrenzte Stereo-PCM-Ausgabe", async ({
  page,
}, info) => {
  await open(page);
  const rendered = await page.evaluate(async () => {
    const lib = window.AudioLab,
      rate = 44100;
    const measure = (buffer: AudioBuffer) => {
      const left = buffer.getChannelData(0),
        right = buffer.getChannelData(1);
      let peak = 0,
        power = 0,
        stereo = 0,
        step = 0,
        stepIndex = 0,
        fingerprint = 0;
      for (let i = 0; i < left.length; i++) {
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        power += left[i] ** 2;
        stereo += Math.abs(left[i] - right[i]);
        if (i && Math.abs(left[i] - left[i - 1]) > step) {
          step = Math.abs(left[i] - left[i - 1]);
          stepIndex = i;
        }
        if (i % 997 === 0) fingerprint += left[i] * (i % 37);
      }
      return {
        peak,
        rms: Math.sqrt(power / left.length),
        stereo: stereo / left.length,
        maxStep: step,
        maxStepAt: stepIndex / rate,
        stepSamples: Array.from(
          left.slice(Math.max(0, stepIndex - 4), stepIndex + 5),
        ),
        fingerprint,
      };
    };
    const encode = (buffer: AudioBuffer) => {
      const frames = Math.min(buffer.length, rate * 32),
        data = new ArrayBuffer(44 + frames * 4),
        view = new DataView(data);
      const text = (at: number, s: string) => {
        for (let i = 0; i < s.length; i++)
          view.setUint8(at + i, s.charCodeAt(i));
      };
      text(0, "RIFF");
      view.setUint32(4, data.byteLength - 8, true);
      text(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      text(36, "data");
      view.setUint32(40, frames * 4, true);
      for (let i = 0; i < frames; i++)
        for (let ch = 0; ch < 2; ch++)
          view.setInt16(
            44 + i * 4 + ch * 2,
            Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i])) * 32767,
            true,
          );
      let binary = "";
      const bytes = new Uint8Array(data);
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    };
    const music = [];
    for (const inGame of [false, true]) {
      const context = new OfflineAudioContext(
          2,
          Math.ceil(rate * (264 * lib.BEAT + 3)),
          rate,
        ),
        graph = new lib.SoundGraph(context);
      const p = structuredClone(lib.defaultSound);
      p.musicVolume = 100;
      p.effectsVolume = 100;
      graph.mixer.apply(p);
      graph.scene(inGame);
      for (let beat = 0; beat < 264; beat++)
        graph.beat(beat, 0.05 + beat * lib.BEAT, inGame);
      const result = await context.startRendering();
      music.push({
        name: inGame ? lib.musicTitles.game : lib.musicTitles.menu,
        ...measure(result),
        seconds: result.duration,
        wav: encode(result),
      });
    }
    const cues: Cue[] = [
      "phone",
      "callAccept",
      "callEnd",
      "busy",
      "radioOpen",
      "radioAck",
      "request",
      "priority",
      "emergency",
      "dme",
      "siren",
      "station",
      "gong",
      "ambience",
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
    const effects = [];
    for (const cue of cues) {
      const context = new OfflineAudioContext(2, rate * 5, rate),
        graph = new lib.SoundGraph(context);
      const p = structuredClone(lib.defaultSound);
      p.effectsVolume = 100;
      for (const key of Object.keys(
        p.groupVolumes,
      ) as (keyof typeof p.groupVolumes)[])
        p.groupVolumes[key] = 100;
      graph.mixer.apply(p);
      graph.cue(cue, 0.08, 1, graph.mixer.groups[lib.groupFor(cue)]);
      effects.push({ cue, ...measure(await context.startRendering()) });
    }
    const context = new OfflineAudioContext(2, rate * 6, rate),
      graph = new lib.SoundGraph(context),
      p = structuredClone(lib.defaultSound);
    p.musicVolume = 100;
    p.effectsVolume = 100;
    for (const key of Object.keys(
      p.groupVolumes,
    ) as (keyof typeof p.groupVolumes)[])
      p.groupVolumes[key] = 100;
    graph.mixer.apply(p);
    for (let beat = 0; beat < 8; beat++)
      graph.beat(beat, 0.02 + beat * lib.BEAT, false);
    for (const cue of [
      "ambience",
      "ambience",
      "phone",
      "phone",
      "phone",
      "dme",
      "siren",
      "station",
      "gong",
      "radio",
      "priority",
      "complete",
      "level",
      "build",
      "error",
    ] as Cue[])
      graph.cue(cue, 0.12, 1, graph.mixer.groups[lib.groupFor(cue)]);
    return { music, effects, stress: measure(await context.startRendering()) };
  });
  const earlyEvidence = {
    ...rendered,
    music: rendered.music.map(({ wav: _, ...metrics }) => {
      void _;
      return metrics;
    }),
  };
  await writeFile(
    info.outputPath("pcm-messwerte.json"),
    JSON.stringify(earlyEvidence, null, 2),
  );
  for (const music of rendered.music) {
    const path = info.outputPath(`${music.name.replaceAll(" ", "-")}.wav`);
    await writeFile(path, Buffer.from(music.wav, "base64"));
    await info.attach(music.name, { path, contentType: "audio/wav" });
    expect(music.seconds).toBeGreaterThan(200);
    expect(music.rms).toBeGreaterThan(0.003);
    expect(music.peak).toBeLessThan(0.95);
    expect(music.stereo).toBeGreaterThan(0.0001);
    expect(music.maxStep).toBeLessThan(0.1);
  }
  expect(rendered.music[0].fingerprint).not.toBeCloseTo(
    rendered.music[1].fingerprint,
    3,
  );
  for (const effect of rendered.effects) {
    expect(effect.peak, effect.cue).toBeLessThan(0.95);
    expect(effect.rms, effect.cue).toBeGreaterThan(0.00002);
  }
  expect(
    rendered.effects.find((e) => e.cue === "priority")!.fingerprint,
  ).not.toBeCloseTo(
    rendered.effects.find((e) => e.cue === "emergency")!.fingerprint,
    4,
  );
  expect(rendered.stress.peak).toBeLessThan(0.95);
  expect(rendered.stress.rms).toBeGreaterThan(0.01);
  const evidence = {
    ...rendered,
    music: rendered.music.map(({ wav: _, ...metrics }) => {
      void _;
      return metrics;
    }),
  };
  await info.attach("Vollständige PCM-Messwerte", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  await writeFile(
    info.outputPath("pcm-messwerte.json"),
    JSON.stringify(evidence, null, 2),
  );
});

test("fehlende Datei und abgelehnte Medienwiedergabe fallen hörbar auf Originale zurück; keine hängenden Blob-URLs", async ({
  page,
}) => {
  await open(page);
  await active(page);
  await upload(page);
  await preferences(page, {
    music: false,
    groupMuted: {
      ...(await page.evaluate(() => window.AudioLab.defaultSound.groupMuted)),
      ambience: true,
    },
  });
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
    window.AudioLab.audio.cue("station", { id: "rejected" });
  });
  await expect
    .poll(async () => (await stats(page)).rms, { intervals: [20, 30] })
    .toBeGreaterThan(0.0001);
  await expect.poll(async () => (await stats(page)).urls).toBe(0);
  expect((await stats(page)).players).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.AudioLab.audio.state().error))
    .toContain("Originalsignal");
  await page.evaluate(async () => {
    await window.AudioLab.storeSound("gong");
    window.AudioLab.audio.cue("station", { id: "missing-file" });
  });
  await expect
    .poll(async () => (await stats(page)).rms, { intervals: [20, 30] })
    .toBeGreaterThan(0.0001);
  await expect.poll(async () => (await stats(page)).voices.length).toBe(0);
  expect((await stats(page)).urls).toBe(0);
});
