import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { AudioController } from "../src/audio/controller";
import { AudioMixer } from "../src/audio/mixer";
import { AudioOwnership } from "../src/audio/ownership";
import {
  defaultSound,
  groupLevel,
  parseSound,
  AUDIO_SETTINGS_KEY,
  importSoundPreferences,
  exportSoundPreferences,
} from "../src/audio/preferences";
import { storeSound, loadSound, storeSounds } from "../src/audio/custom";
import { AudioEvents } from "../src/audio/events";
import { fresh, type Mission } from "../src/model";
import { legacyIncident } from "../src/simulation/incidents";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("migriert lokale Regler v1 ohne eine explizite Stummschaltung aufzuheben und isoliert Gruppen", () => {
  const p = parseSound(
    JSON.stringify({
      muted: true,
      masterVolume: 32,
      music: false,
      effectsVolume: 41,
      channels: { request: 13, priority: 88 },
    }),
  );
  expect(p).toMatchObject({
    version: 2,
    muted: true,
    masterVolume: 32,
    music: false,
    effectsVolume: 41,
    channels: { request: 13, priority: 88 },
    background: "pause",
  });
  expect(groupLevel(p, "radio")).toBe(0);
  p.muted = false;
  p.groupMuted.alarm = true;
  expect(groupLevel(p, "radio")).toBe(0.41);
  expect(groupLevel(p, "alarm")).toBe(0);
  p.background = "communications";
  expect(groupLevel(p, "ambience", true)).toBe(0);
  expect(groupLevel(p, "radio", true)).toBe(0.41);
  const other = parseSound(null);
  other.channels.priority = 0;
  expect(defaultSound.channels.priority).toBe(100);
});
it("sichert ausschließlich lokale Audioeinstellungen und prüft Import/Migration ohne Speicherung", () => {
  const p = structuredClone(defaultSound);
  p.muted = true;
  p.channels.priority = 23;
  expect(importSoundPreferences(exportSoundPreferences(p))).toEqual(p);
  expect(
    importSoundPreferences(
      JSON.stringify({
        format: "leitstellen-audio-settings",
        version: 1,
        preferences: { muted: true, musicVolume: 12 },
      }),
    ),
  ).toMatchObject({ version: 2, muted: true, musicVolume: 12 });
  expect(localStorage.getItem(AUDIO_SETTINGS_KEY)).toBeNull();
  expect(() =>
    importSoundPreferences('{"format":"leitstellen-verbund","save":{}}'),
  ).toThrow("keine unterstützte");
  expect(() => importSoundPreferences("x".repeat(65537))).toThrow("zu groß");
});
function mixerFixture() {
  const param = () => ({
    value: 1,
    cancelAndHoldAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({ gain: param(), connect: vi.fn() });
  const context = {
    currentTime: 0,
    destination: {},
    createGain: node,
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
  };
  return {
    mixer: new AudioMixer(context as unknown as BaseAudioContext),
    context,
  };
}
it("senkt bei überlappender Kommunikation bis zum letzten Ende ab und stellt den aktuellen Regler wieder her", () => {
  const { mixer, context } = mixerFixture();
  const p = structuredClone(defaultSound);
  mixer.apply(p);
  mixer.duck("phone", true);
  mixer.duck("radio", true);
  expect(mixer.duckCount).toBe(2);
  context.currentTime = 2;
  mixer.duck("phone", false);
  expect(mixer.duckCount).toBe(1);
  expect(mixer.musicDuck.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
    0.24,
    2.12,
  );
  p.musicVolume = 7;
  mixer.apply(p);
  expect(
    mixer.groups.music.gain.linearRampToValueAtTime,
  ).toHaveBeenLastCalledWith(0.07, 2.06);
  context.currentTime = 3;
  mixer.duck("radio", false);
  expect(mixer.musicDuck.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
    1,
    3.65,
  );
  expect(
    mixer.groups.music.gain.linearRampToValueAtTime,
  ).toHaveBeenLastCalledWith(0.07, 2.06);
  mixer.duck("phone", true);
  p.ducking = false;
  mixer.apply(p);
  expect(mixer.musicDuck.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
    1,
    3.65,
  );
});
const sound = (channel: "gong" | "radio", name = "original.wav") => ({
  channel,
  name,
  blob: new Blob(["RIFF0000WAVEtest"]),
  bytes: 16,
  duration: 90,
  enabled: true,
});
it("übernimmt mehrere lokale Zuordnungen atomar und bewahrt beim Quota-Abbruch sämtliche Originale", async () => {
  await storeSound("gong", sound("gong"));
  await storeSound("radio", sound("radio"));
  const put = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, ...args) {
      if (
        this.name === "info" &&
        (args[0] as { channel: string }).channel === "radio"
      ) {
        this.transaction.abort();
        throw new DOMException("full", "QuotaExceededError");
      }
      return put.apply(this, args);
    });
  await expect(
    storeSounds(
      new Map([
        ["gong", sound("gong", "new.wav")],
        ["radio", sound("radio", "new.wav")],
      ]),
    ),
  ).rejects.toThrow();
  spy.mockRestore();
  expect((await loadSound("gong"))?.name).toBe("original.wav");
  expect((await loadSound("radio"))?.name).toBe("original.wav");
});
it("Vorschau/Verwerfen/Übernehmen umfasst Regler UND Dateien, auch nach der ersten Übernahme", async () => {
  await storeSound("gong", sound("gong"));
  const controller = new AudioController();
  await controller.refreshCustom();
  controller.beginSettingsPreview();
  const p = controller.savedPreferences();
  p.musicVolume = 5;
  controller.previewPreferences(p);
  await controller.assignCustom("gong", "radio");
  expect(controller.state().filesDirty).toBe(true);
  expect(await loadSound("radio")).toBeUndefined();
  expect(localStorage.getItem(AUDIO_SETTINGS_KEY)).toBeNull();
  controller.discardPreferences();
  await controller.refreshCustom();
  expect(controller.state().preferences.musicVolume).toBe(35);
  expect(
    controller.state().customSounds.some((s) => s.channel === "radio"),
  ).toBe(false);
  await controller.assignCustom("gong", "radio");
  await controller.applyPreferences(p);
  expect((await loadSound("radio"))?.name).toBe("original.wav");
  expect(parseSound(localStorage.getItem(AUDIO_SETTINGS_KEY)).musicVolume).toBe(
    5,
  );
  expect(controller.state().filesDirty).toBe(false);
  expect(controller.state().settingsPreview).toBe(true);
  await controller.enableCustom("radio", false);
  expect((await loadSound("radio"))?.enabled).toBe(true);
  controller.endSettingsPreview();
  await controller.refreshCustom();
  expect(controller.state().settingsPreview).toBe(false);
  expect((await loadSound("radio"))?.enabled).toBe(true);
});
it("Speicherfehler werden gemeldet und bewahren Datei sowie gespeicherte Regler", async () => {
  localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(defaultSound));
  await storeSound("gong", sound("gong"));
  const controller = new AudioController();
  controller.beginSettingsPreview();
  await controller.enableCustom("gong", false);
  const p = controller.savedPreferences();
  p.muted = true;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore) {
      this.transaction.abort();
      throw new DOMException("full", "QuotaExceededError");
    });
  await expect(controller.applyPreferences(p)).rejects.toThrow();
  spy.mockRestore();
  expect((await loadSound("gong"))?.enabled).toBe(true);
  expect(parseSound(localStorage.getItem(AUDIO_SETTINGS_KEY)).muted).toBe(
    false,
  );
  expect(controller.state().filesDirty).toBe(true);
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  await expect(controller.applyPreferences(p)).rejects.toThrow("blocked");
  expect(controller.state().error).toContain("blocked");
});
it("eine verspätete Dateioperation kann nach Verwerfen keine lokale Datei ändern", async () => {
  await storeSound("gong", sound("gong"));
  const controller = new AudioController();
  controller.beginSettingsPreview();
  const pending = controller.assignCustom("gong", "radio");
  expect(controller.state().filesBusy).toBe(true);
  await expect(
    controller.applyPreferences(controller.savedPreferences()),
  ).rejects.toThrow("Audiodateiprüfung");
  controller.endSettingsPreview();
  await expect(pending).rejects.toThrow("verworfen");
  expect(controller.state().filesBusy).toBe(false);
  expect(await loadSound("radio")).toBeUndefined();
});
it("koordiniert Mehrfachtabs je Konto und gibt beim Logout frei; gesperrter BroadcastChannel stört das Spiel nicht", () => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw Error("blocked");
      }
    },
  );
  let now = 100;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const one = new AudioOwnership(() => {}),
    two = new AudioOwnership(() => {}),
    other = new AudioOwnership(() => {});
  one.session("account-a");
  two.session("account-a");
  other.session("account-b");
  one.claim();
  expect(one.owns()).toBe(true);
  now++;
  two.claim();
  expect(two.owns()).toBe(true);
  expect(one.owns()).toBe(false);
  other.claim();
  expect(other.owns()).toBe(true);
  expect(two.owns()).toBe(true);
  two.close();
  expect(two.owns()).toBe(false);
  now++;
  one.claim();
  expect(one.owns()).toBe(true);
  one.close();
  other.close();
});
it("initialisiert Audio auch ohne Secure-Context-randomUUID und benutzt die sichere vorhandene Zufallsquelle für Tabkennungen", () => {
  const getRandomValues = vi.fn(crypto.getRandomValues.bind(crypto));
  vi.stubGlobal("crypto", { getRandomValues });
  expect(() => new AudioController()).not.toThrow();
  const one = new AudioOwnership(() => {}),
    two = new AudioOwnership(() => {});
  one.session("http-account");
  two.session("other-http-account");
  one.claim();
  two.claim();
  const first = JSON.parse(
    localStorage.getItem("lv-audio-owner-v2:http-account")!,
  ).id;
  const second = JSON.parse(
    localStorage.getItem("lv-audio-owner-v2:other-http-account")!,
  ).id;
  expect(first).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
  );
  expect(first).not.toBe(second);
  expect(getRandomValues).toHaveBeenCalledTimes(3);
  one.close();
  two.close();
});
it("liefert mehrere neue autorisierte Ereignisse einzeln und spielt bei Moduswechsel/Reload/offline keine Historie", () => {
  const save = fresh("Audio", "Test", 100),
    m: Mission = {
      id: "m",
      template: "bin",
      pos: { x: 1, y: 1 },
      progress: 0,
      phase: "offered",
      created: 100,
      completed: 0,
      shared: false,
      round: "r",
      contributors: [],
      transports: [],
    };
  legacyIncident(save, m);
  save.missions = [m];
  save.revision = 1;
  const events = new AudioEvents();
  expect(events.observeAll(save, "multi", true)).toEqual([]);
  const next = structuredClone(save);
  next.revision++;
  const base = next.missions[0].control!.events[0];
  next.missions[0].control!.events.push(
    { ...base, id: "a", type: "CALL_ACCEPTED" },
    { ...base, id: "b", type: "SPEAK_REQUESTED" },
    { ...base, id: "c", type: "ALARM", alarm: "dme" },
  );
  const cues = events.observeAll(next, "multi", true);
  expect(cues.map((c) => c.id)).toEqual(["a", "b", "c"]);
  expect(cues.map((c) => c.cue)).toEqual(["callAccept", "request", "dme"]);
  expect(events.observeAll(next, "multi", true)).toEqual([]);
  next.revision++;
  next.missions[0].control!.events.push({
    ...base,
    id: "old-secret",
    type: "CALL_RECEIVED",
  });
  next.generation = "replacement-world";
  expect(events.observeAll(next, "multi", true)).toEqual([]);
  expect(events.observeAll(next, "multi", false)).toEqual([]);
  expect(events.observeAll(next, "multi", true)).toEqual([]);
});
