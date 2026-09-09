import { customChannel, type CustomChannel } from "./profiles";

export interface SoundInfo {
  channel: CustomChannel;
  name: string;
  bytes: number;
  duration: number;
  enabled: boolean;
}
export interface CustomSound extends SoundInfo {
  blob: Blob;
}
type LegacySound = { channel: CustomChannel; name: string; data: ArrayBuffer };

/** Inspect a small header only. The browser checks the actual codec afterwards. */
export function checkSoundFile(name: string, header: ArrayBuffer) {
  const bytes = new Uint8Array(header),
    tag = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b)),
    extension = name.toLowerCase().split(".").pop();
  const valid =
    (extension === "wav" && tag(0, 4) === "RIFF" && tag(8, 12) === "WAVE") ||
    (extension === "ogg" && tag(0, 4) === "OggS") ||
    (extension === "mp3" &&
      (tag(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224)));
  if (!valid)
    throw Error("Bitte eine gültige WAV-, MP3- oder OGG-Audiodatei wählen.");
}
export function soundError(error: unknown): Error {
  if (error instanceof Error && error.name === "QuotaExceededError")
    return Error(
      "Der lokale Browserspeicher ist voll. Lösche eigene Sounds oder gib Speicher für diese Website frei. Die bisherige Datei bleibt erhalten.",
    );
  return error instanceof Error
    ? error
    : Error("Der lokale Audiospeicher ist nicht verfügbar.");
}
export async function soundStorage() {
  try {
    const estimate = await navigator.storage?.estimate();
    if (
      typeof estimate?.quota === "number" &&
      Number.isFinite(estimate.quota) &&
      typeof estimate.usage === "number" &&
      Number.isFinite(estimate.usage)
    )
      return {
        quota: estimate.quota,
        usage: estimate.usage,
        free: Math.max(0, estimate.quota - estimate.usage),
      };
  } catch {
    /* HTTP/private browsing may not expose an estimate. IndexedDB decides. */
  }
  return null;
}
/** No full-file arrayBuffer or decodeAudioData: long recordings stay browser-streamed. */
export async function inspectSound(file: File): Promise<number> {
  if (!file.size) throw Error("Die Audiodatei ist leer.");
  checkSoundFile(file.name, await file.slice(0, 16).arrayBuffer());
  return new Promise<number>((resolve, reject) => {
    const player = new Audio(),
      url = URL.createObjectURL(file);
    let duration = 0;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      player.onloadedmetadata = player.onloadeddata = player.onerror = null;
      player.pause();
      player.removeAttribute("src");
      player.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(duration);
    };
    const timeout = setTimeout(
      () =>
        finish(
          Error(
            "Der Browser konnte diese Audiodatei nicht rechtzeitig lesen. Bitte Format und Datei prüfen.",
          ),
        ),
      30000,
    );
    player.onloadedmetadata = () => {
      duration = player.duration;
      if (!Number.isFinite(duration) || duration <= 0)
        finish(Error("Die Audiodatei enthält keine lesbare Spieldauer."));
    };
    // loadeddata proves that this browser can decode the first frame, not just its container.
    player.onloadeddata = () => {
      if (Number.isFinite(duration) && duration > 0) finish();
    };
    player.onerror = () =>
      finish(
        Error(
          "Dieser Browser kann die Audiodatei nicht abspielen. Bitte eine intakte WAV-, MP3- oder OGG-Datei verwenden.",
        ),
      );
    player.preload = "auto";
    player.src = url;
    player.load();
  });
}
function metadata(value: CustomSound): SoundInfo {
  const { blob: _, ...info } = value;
  void _;
  return info;
}
function convert(value: CustomSound | LegacySound): CustomSound {
  if ("blob" in value) return value;
  const blob = new Blob([value.data]);
  return {
    channel: value.channel,
    name: value.name,
    blob,
    bytes: blob.size,
    duration: 0,
    enabled: true,
  };
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lv-custom-audio-v1", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      const signals = db.objectStoreNames.contains("signals")
        ? request.transaction!.objectStore("signals")
        : db.createObjectStore("signals", { keyPath: "channel" });
      const info = db.createObjectStore("info", { keyPath: "channel" });
      const cursor = signals.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (customChannel(row.value.channel)) {
          const value = convert(row.value);
          row.update(value);
          info.put(metadata(value));
        } else row.delete();
        row.continue();
      };
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(soundError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(
        Error(
          "Bitte andere Spiel-Tabs schließen, damit der lokale Audiospeicher aktualisiert werden kann.",
        ),
      );
    };
  });
}
export async function customSounds(): Promise<SoundInfo[]> {
  const db = await database();
  try {
    return await new Promise<SoundInfo[]>((resolve, reject) => {
      const r = db.transaction("info").objectStore("info").getAll();
      r.onsuccess = () =>
        resolve(r.result.filter((v: SoundInfo) => customChannel(v.channel)));
      r.onerror = () => reject(soundError(r.error));
    });
  } finally {
    db.close();
  }
}
export async function loadSound(
  channel: CustomChannel,
): Promise<CustomSound | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("signals").objectStore("signals").get(channel);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(soundError(r.error));
    });
  } finally {
    db.close();
  }
}
export async function storeSound(
  channel: CustomChannel,
  value?: CustomSound | LegacySound,
) {
  if (!customChannel(channel) || (value && value.channel !== channel))
    throw Error("Prioritäts- und Notfallsignale können nicht ersetzt werden.");
  const sound = value ? convert(value) : undefined;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["signals", "info"], "readwrite");
      if (sound) {
        tx.objectStore("signals").put(sound);
        tx.objectStore("info").put(metadata(sound));
      } else {
        tx.objectStore("signals").delete(channel);
        tx.objectStore("info").delete(channel);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(soundError(tx.error));
      tx.onabort = () => reject(soundError(tx.error));
    });
  } catch (error) {
    throw soundError(error);
  } finally {
    db.close();
  }
}
