import { channels, type SoundChannel } from "./profiles";
export interface CustomSound {
  channel: SoundChannel;
  name: string;
  data: ArrayBuffer;
}
export const MAX_SOUND_BYTES = 2 * 1024 * 1024;
export function checkSoundFile(name: string, data: ArrayBuffer) {
  if (!data.byteLength || data.byteLength > MAX_SOUND_BYTES)
    throw Error("Audiodatei muss zwischen 1 Byte und 2 MB groß sein.");
  const bytes = new Uint8Array(data),
    tag = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  const wav = tag(0, 4) === "RIFF" && tag(8, 12) === "WAVE";
  const ogg = tag(0, 4) === "OggS";
  const mp3 =
    tag(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!/\.(wav|mp3|ogg)$/i.test(name) || !(wav || ogg || mp3))
    throw Error("Bitte eine WAV-, MP3- oder OGG-Audiodatei wählen.");
}
export function normalizeSound(buffer: AudioBuffer) {
  if (
    buffer.duration <= 0 ||
    buffer.duration > 15 ||
    buffer.numberOfChannels > 2
  )
    throw Error(
      "Eigene Signale dürfen höchstens 15 Sekunden lang sein und maximal zwei Kanäle enthalten.",
    );
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++)
    for (const value of buffer.getChannelData(ch)) {
      if (!Number.isFinite(value)) throw Error("Ungültige Audiodaten.");
      peak = Math.max(peak, Math.abs(value));
    }
  if (peak < 0.00001)
    throw Error("Die Audiodatei enthält kein hörbares Signal.");
  // Leave headroom for simultaneous music and notifications; never amplify quiet uploads.
  const factor = Math.min(1, 0.35 / peak);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= factor;
  }
  return buffer;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lv-custom-audio-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("signals", { keyPath: "channel" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function customSounds(): Promise<CustomSound[]> {
  const db = await database();
  try {
    return await new Promise<CustomSound[]>((resolve, reject) => {
      const r = db.transaction("signals").objectStore("signals").getAll();
      r.onsuccess = () =>
        resolve(
          r.result.filter((v: CustomSound) =>
            Object.hasOwn(channels, v.channel),
          ),
        );
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function storeSound(channel: SoundChannel, value?: CustomSound) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("signals", "readwrite");
      const store = tx.objectStore("signals");
      if (value) store.put(value);
      else store.delete(channel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
