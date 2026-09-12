import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  checkSoundFile,
  customSounds,
  loadSound,
  storeSound,
  soundStorage,
  soundError,
  inspectSound,
} from "../src/client/audio/custom";
import {
  channelFor,
  customChannel,
  defaultChannels,
  type CustomChannel,
} from "../src/client/audio/profiles";
import { parseSound } from "../src/client/audio/controller";
import { priorityTone } from "../src/client/audio/events";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const wav = new TextEncoder().encode("RIFF0000WAVEtest").buffer;
const sound = (channel: CustomChannel = "gong") => ({
  channel,
  name: "alarm.wav",
  blob: new Blob([wav]),
  bytes: wav.byteLength,
  duration: 1234,
  enabled: true,
});

describe("ausschließlich lokaler Audiospeicher", () => {
  it("speichert lange große Dateien als Blob, liest nur Metadaten beim Start und kann ersetzen/löschen", async () => {
    const blob = new Blob([wav, new Uint8Array(8 * 1024 * 1024)]);
    await storeSound("gong", { ...sound(), blob, bytes: blob.size });
    const info = (await customSounds())[0];
    expect(info.duration).toBe(1234);
    expect(info.bytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(info).not.toHaveProperty("blob");
    expect(info).not.toHaveProperty("data");
    const loaded = (await loadSound("gong"))!;
    expect(loaded.blob).toBeInstanceOf(Blob);
    expect(await loaded.blob.slice(0, 16).arrayBuffer()).toEqual(wav);
    await storeSound("gong", {
      ...sound(),
      name: "ersatz.wav",
      enabled: false,
    });
    expect((await customSounds())[0]).toMatchObject({
      name: "ersatz.wav",
      enabled: false,
    });
    await storeSound("gong");
    expect(await customSounds()).toEqual([]);
    expect(await loadSound("gong")).toBeUndefined();
  });
  it("migriert vorhandene v1-ArrayBuffer ohne Datei-/Einstellungsverlust", async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("lv-custom-audio-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("signals", { keyPath: "channel" });
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("signals", "readwrite");
      tx.objectStore("signals").put({
        channel: "radio",
        name: "original.wav",
        data: wav,
      });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect(await customSounds()).toEqual([
      {
        channel: "radio",
        name: "original.wav",
        bytes: wav.byteLength,
        duration: 0,
        enabled: true,
      },
    ]);
    expect(await (await loadSound("radio"))!.blob.arrayBuffer()).toEqual(wav);
    await storeSound("radio", {
      ...(await loadSound("radio"))!,
      enabled: false,
    });
    expect((await customSounds())[0].enabled).toBe(false);
  });
  it("ein fehlgeschlagener atomarer Ersatz behält Datei und Metadaten", async () => {
    await storeSound("gong", sound());
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        if (this.name === "info") {
          this.transaction.abort();
          throw new DOMException("full", "QuotaExceededError");
        }
        return original.apply(this, args);
      });
    await expect(
      storeSound("gong", { ...sound(), name: "ersatz.wav" }),
    ).rejects.toThrow();
    spy.mockRestore();
    expect((await customSounds())[0].name).toBe("alarm.wav");
    expect((await loadSound("gong"))!.name).toBe("alarm.wav");
    expect(
      soundError(new DOMException("full", "QuotaExceededError")).message,
    ).toContain("bisherige Datei bleibt erhalten");
  });
  it("berücksichtigt reale Browserquota und erfindet bei fehlendem API keinen Grenzwert", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ quota: 12345, usage: 2345 }) },
    });
    expect(await soundStorage()).toEqual({
      quota: 12345,
      usage: 2345,
      free: 10000,
    });
    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => {
          throw Error("blocked");
        },
      },
    });
    expect(await soundStorage()).toBeNull();
    vi.stubGlobal("navigator", {});
    expect(await soundStorage()).toBeNull();
  });
  it("lässt geschützte Kanäle auch über die Speicher-API nicht überschreiben", async () => {
    expect(customChannel("priority")).toBe(false);
    await expect(
      storeSound("priority" as CustomChannel, sound()),
    ).rejects.toThrow("nicht ersetzt");
    await expect(storeSound("gong", sound("pager"))).rejects.toThrow();
    expect(await customSounds()).toEqual([]);
  });
});

it("unterscheidet normale, Sprechwunsch-, Prioritäts- und Notfallkanäle und migriert Lautstärken", () => {
  const preferences = parseSound('{"channels":{"radio":30,"gong":70}}');
  expect(preferences.channels).toEqual({
    ...defaultChannels,
    radio: 30,
    gong: 70,
  });
  expect(channelFor("request")).toBe("request");
  expect(channelFor("priority")).toBe("priority");
  expect(channelFor("emergency")).toBe("priority");
  expect(priorityTone("HOCH")).toBe("priority");
  expect(priorityTone("KRITISCH")).toBe("priority");
  expect(priorityTone("PRIORITÄT")).toBe("priority");
  expect(priorityTone("NOTFALL")).toBe("emergency");
  expect(priorityTone("NORMAL")).toBeNull();
});
it("prüft passende WAV/MP3/OGG-Container ohne Größen-/Spieldauergrenze", () => {
  expect(() => checkSoundFile("gross.wav", wav)).not.toThrow();
  expect(() =>
    checkSoundFile("musik.mp3", new TextEncoder().encode("ID3testing").buffer),
  ).not.toThrow();
  expect(() =>
    checkSoundFile("musik.ogg", new TextEncoder().encode("OggStesting").buffer),
  ).not.toThrow();
  expect(() => checkSoundFile("falsch.mp3", wav)).toThrow("gültige");
  expect(() => checkSoundFile("empty.wav", new ArrayBuffer(0))).toThrow();
});
it("probe reads only the header and releases its local URL on codec failure", async () => {
  const revoked = vi.spyOn(URL, "revokeObjectURL");
  const players: {
    onerror?: () => void;
    onloadedmetadata?: () => void;
    onloadeddata?: () => void;
    load: () => void;
  }[] = [];
  vi.stubGlobal(
    "Audio",
    class {
      onerror?: () => void;
      onloadedmetadata?: () => void;
      onloadeddata?: () => void;
      pause() {}
      removeAttribute() {}
      load() {}
      constructor() {
        players.push(this);
      }
    },
  );
  const file = new File([wav, new Uint8Array(4 * 1024 * 1024)], "local.wav");
  const entire = vi.spyOn(file, "arrayBuffer");
  const promise = inspectSound(file);
  await vi.waitFor(() => expect(players).toHaveLength(1));
  players[0].onerror!();
  await expect(promise).rejects.toThrow("nicht abspielen");
  expect(entire).not.toHaveBeenCalled();
  expect(revoked).toHaveBeenCalledTimes(1);
});
