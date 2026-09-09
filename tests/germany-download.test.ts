import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const dataset =
  "155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90";
const releaseTag = "germany-data-2026-09-07-v1";
const baseUrl = `https://github.com/Philipp284868/Leitstellen-Verbund/releases/download/${releaseTag}`;
const downloader = pathToFileURL(
  resolve("scripts/geodata/download-package.mjs"),
).href;
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Part = { asset: string; bytes: number; sha256: string; rawBytes: number };
type Entry = { path: string; bytes: number; sha256: string; parts: Part[] };
type Catalog = {
  schema: number;
  worldId: string;
  dataset: string;
  releaseTag: string;
  baseUrl: string;
  chunkBytes: number;
  compression: string;
  files: Entry[];
};
type Network = (url: string, request: number) => Promise<Response> | Response;
const ownedProcesses = new Map<ChildProcess, Promise<void>>();
const delay = (milliseconds: number) =>
  new Promise<void>((done) => setTimeout(done, milliseconds));

function ownProcess(child: ChildProcess) {
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  ownedProcesses.set(child, closed);
  void closed.then(() => ownedProcesses.delete(child));
  return { child, closed };
}

async function stopOwnedProcesses() {
  await Promise.all(
    [...ownedProcesses].map(async ([child, closed]) => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
      await Promise.race([closed, delay(2000)]);
      if (ownedProcesses.has(child)) {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await Promise.race([closed, delay(3000)]);
      }
      if (ownedProcesses.has(child))
        throw Error(
          `Eigener Download-Testprozess ${child.pid} hat seine Dateihandles nicht geschlossen`,
        );
    }),
  );
}
let base: string,
  app: string,
  target: string,
  manifestPath: string,
  catalog: Catalog,
  expected: Map<string, Buffer>,
  payloads: Map<string, Buffer>,
  calls: string[],
  network: Network;

function response(bytes: Buffer) {
  return new Response(Uint8Array.from(bytes), { status: 200 });
}
function entry(path: string) {
  const value = catalog.files.find((file) => file.path === path);
  if (!value) throw Error(`Testdatei fehlt: ${path}`);
  return value;
}
async function saveCatalog() {
  await writeFile(manifestPath, JSON.stringify(catalog));
}
async function install(at = target) {
  const { installGeodata } = await import(downloader);
  return installGeodata({
    target: at,
    programRoot: app,
    manifestPath,
    onProgress: () => undefined,
    fetchImpl: async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(url);
      return network(url, calls.length);
    },
  });
}
async function assertInstalled() {
  for (const [path, bytes] of expected)
    expect(await readFile(resolve(target, path)), path).toEqual(bytes);
}
async function assertUnpublished() {
  await expect(access(resolve(target, "manifest.json"))).rejects.toThrow();
}

beforeEach(async () => {
  base = await mkdtemp(resolve(tmpdir(), "lv-germany-download-"));
  app = resolve(base, "app");
  target = resolve(base, "geodata");
  manifestPath = resolve(app, "download-manifest.json");
  await mkdir(app);
  catalog = {
    schema: 1,
    worldId: "germany-1",
    dataset,
    releaseTag,
    baseUrl,
    chunkBytes: 256 * 1024 * 1024,
    compression: "gzip",
    files: [],
  };
  expected = new Map([
    [
      "manifest.json",
      Buffer.from(
        JSON.stringify({
          schema: 1,
          worldId: "germany-1",
          dataset,
          status: "ready",
        }),
      ),
    ],
    [
      "maps.mbtiles",
      Buffer.from(
        "real compressed map fixture: multiple independently verified chunks".repeat(
          2,
        ),
      ),
    ],
    ["index.sqlite", Buffer.from("index fixture")],
    [
      "boundary.geojson",
      Buffer.from('{"type":"FeatureCollection","features":[]}'),
    ],
    ["source-manifest.json", Buffer.from(JSON.stringify({ dataset }))],
    ["graph-source.json", Buffer.from(JSON.stringify({ dataset }))],
    ["graphhopper.yml", Buffer.from("graphhopper: {}\n")],
    ["graph-cache/properties", Buffer.from("graph.version=11\n")],
    ["dem.mbtiles", Buffer.from("elevation fixture")],
    [
      "dem-manifest.json",
      Buffer.from(JSON.stringify({ schema: 1, status: "ready" })),
    ],
    ["dem-license.pdf", Buffer.from("%PDF-fixture")],
    ["dem-NOTICE.txt", Buffer.from("Copernicus DEM source attribution")],
  ]);
  payloads = new Map();
  for (const [fileIndex, [path, bytes]] of [...expected].entries()) {
    const file: Entry = {
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
      parts: [],
    };
    const step = path === "maps.mbtiles" ? 45 : bytes.length;
    for (
      let offset = 0, partIndex = 0;
      offset < bytes.length;
      offset += step, partIndex++
    ) {
      const raw = bytes.subarray(offset, offset + step);
      const compressed = gzipSync(raw);
      const asset = `de-${String(fileIndex + 1).padStart(2, "0")}-${path.replaceAll("/", "-")}-${String(partIndex + 1).padStart(3, "0")}.gz`;
      payloads.set(`${baseUrl}/${asset}`, compressed);
      file.parts.push({
        asset,
        bytes: compressed.length,
        sha256: digest(compressed),
        rawBytes: raw.length,
      });
    }
    catalog.files.push(file);
  }
  calls = [];
  network = (url) => {
    const body = payloads.get(url);
    if (!body) throw Error(`Unerwartete Netzwerkadresse: ${url}`);
    return response(body);
  };
  await saveCatalog();
});

afterEach(async () => {
  // Vitest timeouts do not stop a Node child. Wait for close (including stdio),
  // even on failed assertions, before removing the process's temporary files.
  await stopOwnedProcesses();
  const location = relative(resolve(tmpdir()), base);
  if (!location.startsWith("lv-germany-download-") || location.includes(sep))
    throw Error("Unsicherer Test-Aufräumpfad");
  await rm(base, { recursive: true, force: true });
}, 10000);

describe("Deutschland-Downloadpaket: Integrität, Wiederaufnahme und Bestandsschutz", () => {
  it("installiert echte gzip-Teile vollständig und benötigt beim zweiten Setup keinen Download", async () => {
    await install();
    await assertInstalled();
    expect(calls).toHaveLength(
      catalog.files.reduce((sum, file) => sum + file.parts.length, 0),
    );
    calls = [];
    network = () => {
      throw Error("Ein vollständig installiertes Paket benötigt kein Netzwerk");
    };
    await install();
    await assertInstalled();
    expect(calls).toEqual([]);
  });

  it("veröffentlicht bei einem Abbruch keinen halben Datensatz und verwendet geprüfte Teile erneut", async () => {
    const first = `${baseUrl}/${entry("maps.mbtiles").parts[0].asset}`;
    const interrupted = `${baseUrl}/${entry("maps.mbtiles").parts[1].asset}`;
    let failed = false;
    network = (url) => {
      if (url === interrupted && !failed) {
        failed = true;
        throw Error("Verbindung während des Downloads unterbrochen");
      }
      return response(payloads.get(url)!);
    };
    await expect(install()).rejects.toThrow();
    await assertUnpublished();
    expect(calls.filter((url) => url === first)).toHaveLength(1);
    await install();
    await assertInstalled();
    expect(calls.filter((url) => url === first)).toHaveLength(1);
    expect(calls.filter((url) => url === interrupted)).toHaveLength(2);
  });

  it("setzt nach einem abrupt beendeten Node-Prozess mit verwaister lokaler Sperre fort", async () => {
    const first = `${baseUrl}/${entry("maps.mbtiles").parts[0].asset}`;
    const interrupted = `${baseUrl}/${entry("maps.mbtiles").parts[1].asset}`;
    const fixturePath = resolve(base, "process-fixture.json");
    await writeFile(
      fixturePath,
      JSON.stringify(
        Object.fromEntries(
          [...payloads].map(([url, bytes]) => [url, bytes.toString("base64")]),
        ),
      ),
    );
    const harness = resolve(base, "abrupt-download.mjs");
    await writeFile(
      harness,
      `
      import {readFileSync} from 'node:fs';
      import {installGeodata} from ${JSON.stringify(downloader)};
      const payloads = JSON.parse(readFileSync(${JSON.stringify(fixturePath)}, 'utf8'));
      await installGeodata({target:${JSON.stringify(target)},programRoot:${JSON.stringify(app)},manifestPath:${JSON.stringify(manifestPath)},onProgress:()=>{},fetchImpl:async(input)=>{
        const url=String(input);
        if(url===${JSON.stringify(interrupted)}) process.exit(23);
        return new Response(Buffer.from(payloads[url],'base64'));
      }});
    `,
    );
    const { child, closed } = ownProcess(
      spawn(process.execPath, [harness], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }),
    );
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    await closed;
    expect(child.exitCode, output).toBe(23);
    await assertUnpublished();
    await install();
    await assertInstalled();
    expect(calls).not.toContain(first);
    expect(calls.filter((url) => url === interrupted)).toHaveLength(1);
  }, 15000);

  it("verwirft einen abgebrochenen HTTP-Body und lädt diesen Teil beim nächsten Versuch neu", async () => {
    const selected = `${baseUrl}/${entry("maps.mbtiles").parts[0].asset}`;
    let failed = false;
    network = (url) => {
      if (url === selected && !failed) {
        failed = true;
        const body = payloads.get(url)!;
        let read = false;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (!read) {
                read = true;
                controller.enqueue(Uint8Array.from(body.subarray(0, 5)));
              } else controller.error(Error("Abbruch nach fünf Bytes"));
            },
          }),
        );
      }
      return response(payloads.get(url)!);
    };
    await expect(install()).rejects.toThrow();
    await assertUnpublished();
    await install();
    await assertInstalled();
    expect(calls.filter((url) => url === selected)).toHaveLength(2);
  });

  it.each(["checksum", "excess", "truncated", "http"])(
    "lehnt einen fehlerhaften Download (%s) vor der Veröffentlichung ab",
    async (kind) => {
      const selected = `${baseUrl}/${entry("maps.mbtiles").parts[0].asset}`;
      network = (url) => {
        const valid = payloads.get(url)!;
        if (url !== selected) return response(valid);
        if (kind === "http")
          return new Response("unavailable", { status: 503 });
        if (kind === "excess")
          return response(Buffer.concat([valid, Buffer.from("extra")]));
        if (kind === "truncated")
          return response(valid.subarray(0, valid.length - 1));
        const changed = Buffer.from(valid);
        changed[changed.length - 1] ^= 1;
        return response(changed);
      };
      await expect(install()).rejects.toThrow();
      await assertUnpublished();
    },
  );

  it("begrenzt die entpackte Größe auch bei gültiger komprimierter Prüfsumme", async () => {
    const file = entry("index.sqlite"),
      part = file.parts[0];
    const expanded = Buffer.alloc(512 * 1024, "x");
    const compressed = gzipSync(expanded);
    payloads.set(`${baseUrl}/${part.asset}`, compressed);
    part.bytes = compressed.length;
    part.sha256 = digest(compressed);
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    await assertUnpublished();
  });

  it("prüft zusätzlich die gesamte zusammengesetzte Datei", async () => {
    entry("maps.mbtiles").sha256 = "0".repeat(64);
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    await assertUnpublished();
  });

  it("lässt ein vorhandenes fremdes Verzeichnis bytegleich bestehen", async () => {
    await mkdir(target);
    await writeFile(
      resolve(target, "existing.sqlite"),
      "unveränderlicher Spielstand",
    );
    await expect(install()).rejects.toThrow();
    expect(await readdir(target)).toEqual(["existing.sqlite"]);
    expect(await readFile(resolve(target, "existing.sqlite"), "utf8")).toBe(
      "unveränderlicher Spielstand",
    );
    expect(calls).toEqual([]);
  });

  it("ersetzt auch keinen erst während des Downloads befüllten Zielordner", async () => {
    network = async (url, count) => {
      if (count === 1) {
        await mkdir(target);
        await writeFile(
          resolve(target, "save.sqlite"),
          "parallel angelegter Spielstand",
        );
      }
      return response(payloads.get(url)!);
    };
    await expect(install()).rejects.toThrow();
    expect(await readdir(target)).toEqual(["save.sqlite"]);
    expect(await readFile(resolve(target, "save.sqlite"), "utf8")).toBe(
      "parallel angelegter Spielstand",
    );
    await assertUnpublished();
  });

  it("schreibt bei einer umgeleiteten wiederaufgenommenen Teilinstallation nicht in fremde Ordner", async () => {
    network = () => {
      throw Error("Unterbrechung vor dem ersten Download");
    };
    await expect(install()).rejects.toThrow();
    const unrelated = resolve(base, "unrelated");
    await mkdir(unrelated);
    await writeFile(resolve(unrelated, "properties"), "unverändert");
    const stage = resolve(base, `.geodata.install-${dataset.slice(0, 12)}`);
    await symlink(
      unrelated,
      resolve(stage, "content/graph-cache"),
      process.platform === "win32" ? "junction" : "dir",
    );
    network = (url) => response(payloads.get(url)!);
    await expect(install()).rejects.toThrow();
    expect(await readdir(unrelated)).toEqual(["properties"]);
    expect(await readFile(resolve(unrelated, "properties"), "utf8")).toBe(
      "unverändert",
    );
    await assertUnpublished();
  });

  it("überschreibt keine nachträglich beschädigte Datei einer fertigen Installation", async () => {
    await install();
    const corrupted = Buffer.from("nachträglich geändert");
    await writeFile(resolve(target, "maps.mbtiles"), corrupted);
    calls = [];
    await expect(install()).rejects.toThrow();
    expect(await readFile(resolve(target, "maps.mbtiles"))).toEqual(corrupted);
    expect(calls).toEqual([]);
  });

  it.each([
    "../outside",
    "graph-cache/../../outside",
    "/absolute",
    "graph-cache/sub/file",
    "graph-cache\\outside",
    "save.sqlite",
  ])("verweigert einen unerlaubten Zielpfad %s ohne Download", async (path) => {
    entry("index.sqlite").path = path;
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    expect(calls).toEqual([]);
    await assertUnpublished();
  });

  it.each([
    "../outside.gz",
    "https://evil.example/data.gz",
    "part%2foutside.gz",
  ])("verweigert einen unerlaubten Asset-Namen %s", async (asset) => {
    entry("index.sqlite").parts[0].asset = asset;
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it.each(["baseUrl", "dataset", "worldId", "releaseTag"])(
    "akzeptiert keinen fremden Ursprung bzw. Datensatz (%s)",
    async (field) => {
      catalog[field as "baseUrl" | "dataset" | "worldId" | "releaseTag"] =
        "untrusted";
      await saveCatalog();
      await expect(install()).rejects.toThrow();
      expect(calls).toEqual([]);
    },
  );

  it("verweigert doppelte Dateiziele", async () => {
    entry("index.sqlite").path = "maps.mbtiles";
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("verweigert mehrfach verwendete Asset-Namen", async () => {
    entry("index.sqlite").parts[0].asset = entry("maps.mbtiles").parts[0].asset;
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("verweigert einen Zielordner innerhalb des Programms", async () => {
    await expect(install(resolve(app, "geodata"))).rejects.toThrow();
    expect(calls).toEqual([]);
    expect(await readdir(app)).toEqual(["download-manifest.json"]);
  });

  it("folgt weder einem verknüpften Ziel noch einem verknüpften übergeordneten Ordner", async () => {
    const actual = resolve(base, "unrelated");
    await mkdir(actual);
    await writeFile(resolve(actual, "sentinel"), "unberührt");
    const alias = resolve(base, "alias");
    await symlink(
      actual,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(install(alias)).rejects.toThrow();
    await expect(install(resolve(alias, "nested"))).rejects.toThrow();
    expect(await readdir(actual)).toEqual(["sentinel"]);
    expect(await readFile(resolve(actual, "sentinel"), "utf8")).toBe(
      "unberührt",
    );
    expect(calls).toEqual([]);
  });

  it("lässt nur eine gleichzeitige Installation in denselben Zielordner zu", async () => {
    let entered!: () => void, release!: () => void;
    const firstFetch = new Promise<void>((done) => {
      entered = done;
    });
    const gate = new Promise<void>((done) => {
      release = done;
    });
    network = async (url, count) => {
      if (count === 1) {
        entered();
        await gate;
      }
      return response(payloads.get(url)!);
    };
    const first = install();
    try {
      await firstFetch;
      await expect(install()).rejects.toThrow();
    } finally {
      release();
      await first;
    }
    await assertInstalled();
  });

  it("kann bei gleichzeitiger Wiederaufnahme keine inzwischen aktive Sperre stehlen", async () => {
    const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
      windowsHide: true,
    });
    expect(exited.status).toBe(0);
    const stage = resolve(base, `.geodata.install-${dataset.slice(0, 12)}`);
    await mkdir(stage);
    await writeFile(
      resolve(stage, "receipt.json"),
      JSON.stringify({
        schema: 1,
        target,
        dataset,
        catalogSha256: digest(await readFile(manifestPath)),
      }),
    );
    await writeFile(
      resolve(stage, "lock.json"),
      JSON.stringify({ pid: exited.pid, hostname: hostname() }),
    );
    const fixture = resolve(base, "race-fixture.json");
    await writeFile(
      fixture,
      JSON.stringify(
        Object.fromEntries(
          [...payloads].map(([url, bytes]) => [url, bytes.toString("base64")]),
        ),
      ),
    );
    const beforeCheck = resolve(base, "before-pid-check"),
      releaseCheck = resolve(base, "release-pid-check"),
      networkFile = resolve(base, "downloaders"),
      releaseNetwork = resolve(base, "release-network");
    const harness = resolve(base, "racing-download.mjs");
    await writeFile(
      harness,
      `
      import {existsSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
      import {setTimeout as delay} from 'node:timers/promises';
      import {installGeodata} from ${JSON.stringify(downloader)};
      const name=process.argv[2], originalKill=process.kill.bind(process);
      process.kill=(pid,signal)=>{
        if(name==='B' && pid===${exited.pid}){
          writeFileSync(${JSON.stringify(beforeCheck)},'ready');
          const deadline=Date.now()+10000, gate=new Int32Array(new SharedArrayBuffer(4));
          while(!existsSync(${JSON.stringify(releaseCheck)})){
            if(Date.now()>deadline) throw Error('Testfreigabe fehlt');
            Atomics.wait(gate,0,0,10);
          }
        }
        return originalKill(pid,signal);
      };
      const payloads=JSON.parse(readFileSync(${JSON.stringify(fixture)},'utf8'));
      try {
        await installGeodata({target:${JSON.stringify(target)},programRoot:${JSON.stringify(app)},manifestPath:${JSON.stringify(manifestPath)},onProgress:()=>{},fetchImpl:async(input)=>{
          appendFileSync(${JSON.stringify(networkFile)},name+'\\n');
          while(!existsSync(${JSON.stringify(releaseNetwork)})) await delay(10);
          return new Response(Buffer.from(payloads[String(input)],'base64'));
        }});
      } catch(error) { console.error(error.message);process.exitCode=1; }
    `,
    );
    function start(name: string) {
      const { child, closed } = ownProcess(
        spawn(process.execPath, [harness, name], {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        }),
      );
      let output = "";
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
      });
      return {
        child,
        ended: closed.then(() => ({ code: child.exitCode, output })),
      };
    }
    async function waitForFile(path: string) {
      const deadline = Date.now() + 5000;
      while (true) {
        try {
          await access(path);
          return;
        } catch {
          /* test process has not reached its gate */
        }
        if (Date.now() > deadline)
          throw Error(`Testprozess erreicht ${path} nicht`);
        await new Promise((done) => setTimeout(done, 10));
      }
    }
    const b = start("B");
    let a: ReturnType<typeof start> | undefined;
    try {
      await waitForFile(beforeCheck);
      a = start("A");
      await Promise.race([waitForFile(networkFile), a.ended]);
      await writeFile(releaseCheck, "continue");
      await waitForFile(networkFile);
      // B either becomes the sole downloader (correct guard) or joins A after
      // unconditionally removing A's live lock (the original stale-lock race).
      await Promise.race([
        b.ended,
        (async () => {
          const deadline = Date.now() + 1000;
          while (Date.now() < deadline) {
            const names = new Set(
              (await readFile(networkFile, "utf8")).trim().split("\n"),
            );
            if (names.has("B")) return;
            await new Promise((done) => setTimeout(done, 10));
          }
        })(),
      ]);
      expect(
        new Set((await readFile(networkFile, "utf8")).trim().split("\n")).size,
      ).toBe(1);
    } finally {
      await writeFile(releaseCheck, "continue");
      await writeFile(releaseNetwork, "continue");
      await Promise.all([b.ended, ...(a ? [a.ended] : [])]);
    }
    const results = await Promise.all([b.ended, a!.ended]);
    expect(results.map((result) => result.code).sort()).toEqual([0, 1]);
    await assertInstalled();
  }, 15000);

  it("veröffentlicht kein Paket mit einem fremden oder unfertigen inneren Manifest", async () => {
    const file = entry("manifest.json");
    const invalid = Buffer.from(
      JSON.stringify({
        schema: 1,
        worldId: "germany-1",
        dataset,
        status: "building",
      }),
    );
    const compressed = gzipSync(invalid);
    file.bytes = invalid.length;
    file.sha256 = digest(invalid);
    file.parts[0] = {
      ...file.parts[0],
      rawBytes: invalid.length,
      bytes: compressed.length,
      sha256: digest(compressed),
    };
    payloads.set(`${baseUrl}/${file.parts[0].asset}`, compressed);
    await saveCatalog();
    await expect(install()).rejects.toThrow();
    await assertUnpublished();
  });
});
