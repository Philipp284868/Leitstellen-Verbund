/** Reproducible offline Germany data preparation. Never modifies game save data. */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
  readdir,
} from "node:fs/promises";
import { resolve, dirname, join, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { resolveConfiguration } from "../configuration.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configuration = resolveConfiguration({
  programRoot: repo,
  requirePaths: false,
});
const root = resolve(
  repo,
  configuration.settings.GEODATA_DIR || "../leitstellen-deutschland-geodata",
);
const relativeRoot = relative(repo, root);
if (
  !relativeRoot ||
  (relativeRoot !== ".." &&
    !relativeRoot.startsWith(`..${sep}`) &&
    !isAbsolute(relativeRoot))
)
  throw Error("GEODATA_DIR muss außerhalb des Programmverzeichnisses liegen.");
const command = process.argv[2] || "prepare";
const toolDir = join(root, "tools"),
  sourceDir = join(root, "sources"),
  logs = join(root, "logs");
await Promise.all(
  [toolDir, sourceDir, logs].map((p) => mkdir(p, { recursive: true })),
);
const windows = process.platform === "win32";
if (!windows && process.platform !== "linux")
  throw Error("Pipeline unterstützt Windows und Linux x64.");
if (process.arch !== "x64")
  throw Error("Für diese gepinnten Werkzeuge wird x64 benötigt.");
const jdk = windows
  ? {
      name: "OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip",
      sha256:
        "f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e",
    }
  : {
      name: "OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz",
      sha256:
        "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94",
    };
const downloads = [
  {
    ...jdk,
    directory: toolDir,
    url: `https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/${jdk.name}`,
  },
  {
    name: "graphhopper-web-11.0.jar",
    directory: toolDir,
    url: "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/11.0/graphhopper-web-11.0.jar",
    sha256: "b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def",
  },
  {
    name: "planetiler-0.10.2.jar",
    directory: toolDir,
    url: "https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar",
    sha256: "f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d",
  },
  {
    name: "germany-260907.osm.pbf",
    directory: sourceDir,
    url: "https://download.geofabrik.de/europe/germany-260907.osm.pbf",
    md5: "682200b08861c25d97ebcd7765509830",
    sha256: "155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90",
    size: 4834386028,
  },
];
const pbf = join(sourceDir, downloads[3].name);
const auxiliaryDownloads = [
  {
    name: "lake_centerline.shp.zip",
    url: "https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip",
    sha256: "6c900507c88fc9f5b5a386f90fd0a42d0495e8755a03d075538fb9a6801a3192",
  },
  {
    name: "water-polygons-split-3857.zip",
    url: "https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip",
    sha256: "33ff6464066b7680797638303ee47e65a5a78c208835fde1bb25dd101dbbc7b7",
  },
  {
    name: "natural_earth_vector.sqlite.zip",
    url: "https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip",
    sha256: "375da61836d4779dffa8b87887bc4faa94dac77745ba0ee3914bd7cbedf40a02",
  },
].map((item) => ({ ...item, directory: join(root, "data", "sources") }));
const gh = join(toolDir, downloads[1].name),
  planet = join(toolDir, downloads[2].name);
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
async function digest(file, algorithm = "sha256") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function checkBuildInputs(items) {
  for (const item of items) {
    const path = join(item.directory, item.name);
    if ((await digest(path)) !== item.sha256)
      throw Error(
        `Build-Eingabe stimmt nicht mit festem Snapshot überein: ${item.name}`,
      );
  }
}
async function fetchFile(item) {
  const target = join(item.directory, item.name),
    partial = target + ".partial",
    receipt = target + ".receipt.json";
  if (existsSync(target) && existsSync(receipt)) {
    const saved = JSON.parse(await readFile(receipt, "utf8"));
    if (
      saved.url === item.url &&
      saved.bytes === (await stat(target)).size &&
      (!item.sha256 || saved.sha256 === item.sha256) &&
      saved.sha256 === (await digest(target))
    ) {
      log(`Cache geprüft: ${item.name}`);
      return saved;
    }
    throw Error(
      `Unveränderlicher Cache stimmt nicht: ${target}. Nicht automatisch überschrieben.`,
    );
  }
  let offset = existsSync(partial) ? (await stat(partial)).size : 0;
  if (!existsSync(target)) {
    log(`Download ${item.name} ab Byte ${offset}`);
    const response = await fetch(item.url, {
      headers: offset ? { Range: `bytes=${offset}-` } : {},
    });
    if (!response.ok)
      throw Error(`Download ${item.name}: HTTP ${response.status}`);
    if (offset && response.status !== 206) offset = 0;
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(partial, { flags: offset ? "a" : "w" }),
    );
    await rename(partial, target);
  }
  const bytes = (await stat(target)).size,
    sha256 = await digest(target);
  if (item.size && item.size !== bytes)
    throw Error(`Dateigröße falsch: ${item.name}`);
  if (item.sha256 && item.sha256 !== sha256)
    throw Error(`SHA256 falsch: ${item.name}`);
  if (item.md5 && item.md5 !== (await digest(target, "md5")))
    throw Error(`Quell-Prüfsumme falsch: ${item.name}`);
  const result = {
    url: item.url,
    sha256,
    bytes,
    checkedAt: new Date().toISOString(),
    upstreamMd5: item.md5,
  };
  await writeFile(receipt, JSON.stringify(result, null, 2) + "\n");
  log(`Verifiziert ${item.name}: ${bytes} Bytes, SHA256 ${sha256}`);
  return result;
}
async function run(executable, args, label) {
  log(`${label} gestartet`);
  const output = createWriteStream(join(logs, `${label}.log`), { flags: "a" });
  await new Promise((ok, fail) => {
    const child = spawn(executable, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stopping = false;
    let killTimer;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      log(`${label}: beende eigenen Java-Prozess ${child.pid}`);
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        log(
          `${label}: Java beendet sich nicht innerhalb von 20 Sekunden; beende ausschließlich diesen Prozess.`,
        );
        child.kill("SIGKILL");
      }, 20000);
      killTimer.unref();
    };
    const ipc = (message) => {
      if (message?.type === "shutdown") shutdown();
    };
    const cleanup = () => {
      clearTimeout(killTimer);
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      process.removeListener("message", ipc);
      process.removeListener("disconnect", shutdown);
      if (process.connected) process.disconnect();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    process.on("message", ipc);
    if (process.connected) process.once("disconnect", shutdown);
    child.stdout.on("data", (data) => {
      output.write(data);
      process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      output.write(data);
      process.stderr.write(data);
    });
    child.on("error", (error) => {
      cleanup();
      output.end();
      fail(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (stopping) {
        // Exit only after the owned child closed; interrupted imports receive no completion manifest.
        output.end(() => process.exit(0));
        return;
      }
      output.end();
      if (code === 0) ok();
      else fail(Error(`${label}: Exit ${code}`));
    });
  });
  log(`${label} abgeschlossen`);
}
async function javaPath() {
  const directories = await readdir(toolDir, { withFileTypes: true });
  const jdkFolder = directories.find(
    (d) =>
      d.isDirectory() &&
      d.name.startsWith("jdk-21.0.12.1") &&
      existsSync(join(toolDir, d.name, "bin", windows ? "java.exe" : "java")),
  );
  if (!jdkFolder) throw Error("Werkzeuge fehlen. Zuerst prepare ausführen.");
  return join(toolDir, jdkFolder.name, "bin", windows ? "java.exe" : "java");
}
const graphConfig = join(root, "graphhopper.yml");
async function config() {
  const text = `graphhopper:\n  datareader.file: "sources/germany-260907.osm.pbf"\n  graph.location: "graph-cache"\n  graph.dataaccess.default_type: MMAP\n  import.osm.ignored_highways: footway,construction,cycleway,path,steps\n  datareader.way_point_max_distance: 0\n  graph.encoded_values: car_access,car_average_speed,road_access,road_class,road_environment,max_speed,osm_way_id\n  profiles:\n    - name: car\n      turn_costs:\n        vehicle_types: [motorcar, motor_vehicle]\n        u_turn_costs: 60\n      custom_model: {"distance_influence": 0, "priority": [{"if": "!car_access", "multiply_by": "0"}], "speed": [{"if": "true", "limit_to": "car_average_speed"}]}\n  profiles_ch: []\n  profiles_lm:\n    - profile: car\n  prepare.min_network_size: 0\n  prepare.lm.threads: 2\n  routing.timeout_ms: 15000\n  routing.max_visited_nodes: 5000000\nserver:\n  application_connectors:\n    - type: http\n      port: 8989\n      bind_host: 127.0.0.1\n  admin_connectors:\n    - type: http\n      port: 8990\n      bind_host: 127.0.0.1\nlogging:\n  level: INFO\n`;
  if (existsSync(graphConfig) && (await readFile(graphConfig, "utf8")) !== text)
    throw Error(
      "GraphHopper-Konfiguration wurde verändert; kein automatisches Überschreiben.",
    );
  await writeFile(graphConfig, text);
}
if (command === "prepare" || command === "tools") {
  const receipts = await Promise.all(
    (command === "tools" ? downloads.slice(0, 3) : downloads).map(fetchFile),
  );
  // An interrupted extraction can already contain bin/java while lib/modules
  // and other required files are still absent. Explicit setup always restores
  // the complete JDK from the archive whose pinned hash was checked above.
  // Runtime "serve" never extracts tools or imports data.
  await run(
    windows ? "tar.exe" : "tar",
    ["-xf", join(toolDir, jdk.name), "-C", toolDir],
    "jdk-extract",
  );
  if (command === "tools") {
    log(
      `Werkzeuge geprüft: ${toolDir}. Kein Deutschland-PBF oder Karten-Zusatzdatensatz geladen.`,
    );
    process.exit(0);
  }
  await config();
  await writeFile(
    join(root, "source-manifest.json"),
    JSON.stringify(
      {
        schema: 1,
        worldId: "germany-1",
        snapshot: "2026-09-07",
        source: receipts[3],
        tools: {
          java: receipts[0],
          graphhopper: receipts[1],
          planetiler: receipts[2],
        },
        attribution: "© OpenStreetMap contributors · © OpenMapTiles",
        license: "https://www.openstreetmap.org/copyright",
      },
      null,
      2,
    ) + "\n",
  );
  log(`Bereit: ${root}`);
} else if (command === "graph") {
  await config();
  if (existsSync(join(root, "graph-cache", "properties")))
    throw Error(
      "Routinggraph existiert bereits; kein stiller Reimport mit anderer Quelle.",
    );
  await checkBuildInputs([downloads[1], downloads[3]]);
  await run(
    await javaPath(),
    ["-Xmx12g", "-jar", gh, "import", graphConfig],
    "graph-import",
  );
  const source = JSON.parse(
    await readFile(join(root, "source-manifest.json"), "utf8"),
  );
  await writeFile(
    join(root, "graph-source.json"),
    JSON.stringify(
      {
        dataset: source.source.sha256,
        graphhopper: source.tools.graphhopper.sha256,
        configSha256: await digest(graphConfig),
      },
      null,
      2,
    ) + "\n",
  );
} else if (command === "serve") {
  await config();
  if (!existsSync(join(root, "graph-cache", "properties")))
    throw Error(
      "Routinggraph fehlt; graph ausführen. Kein Import bei Serverstart.",
    );
  const source = JSON.parse(
      await readFile(join(root, "source-manifest.json"), "utf8"),
    ),
    graphSource = JSON.parse(
      await readFile(join(root, "graph-source.json"), "utf8"),
    );
  if (
    graphSource.dataset !== source.source.sha256 ||
    graphSource.graphhopper !== source.tools.graphhopper.sha256 ||
    graphSource.configSha256 !== (await digest(graphConfig))
  )
    throw Error("Routinggraph passt nicht zu Quelle/Werkzeug/Konfiguration.");
  await checkBuildInputs([downloads[1]]);
  await run(
    await javaPath(),
    ["-Xmx6g", "-jar", gh, "server", graphConfig],
    "routing-server",
  );
} else if (command === "tiles" || command === "assets") {
  if (existsSync(join(root, "maps.mbtiles")))
    throw Error(
      "maps.mbtiles existiert bereits. Unveränderliches Datenpaket nicht überschreiben.",
    );
  await mkdir(join(root, "data", "sources"), { recursive: true });
  for (const item of auxiliaryDownloads) await fetchFile(item);
  if (command === "assets") {
    log(
      "Alle Kartenzusatzquellen heruntergeladen und gegen feste SHA256 geprüft.",
    );
    process.exit(0);
  }
  await checkBuildInputs([downloads[2], downloads[3]]);
  await run(
    await javaPath(),
    [
      "-Xmx8g",
      "-jar",
      planet,
      `--osm-path=${pbf}`,
      `--output=${join(root, "maps.mbtiles")}`,
      "--area=germany",
      "--bounds=5.5,47.1,15.6,55.2",
      "--download=false",
      "--threads=4",
      "--languages=de,en",
      "--fetch-wikidata=false",
      "--use-wikidata=false",
      "--building-merge-z13=false",
      `--tmpdir=${join(root, "tile-tmp")}`,
    ],
    "tiles-build",
  );
  if (command === "tiles") {
    const source = JSON.parse(
      await readFile(join(root, "source-manifest.json"), "utf8"),
    );
    const tiles = new DatabaseSync(join(root, "maps.mbtiles"));
    tiles
      .prepare(
        "INSERT OR REPLACE INTO metadata(name,value) VALUES('source_sha256',?)",
      )
      .run(source.source.sha256);
    tiles
      .prepare(
        "INSERT OR REPLACE INTO metadata(name,value) VALUES('world_id','germany-1')",
      )
      .run();
    tiles.close();
  }
} else if (command === "facilities") {
  await checkBuildInputs([downloads[1], downloads[2], downloads[3]]);
  const extraction = join(root, "facilities-260907.ndjson");
  if (!existsSync(extraction))
    await run(
      await javaPath(),
      [
        "-Xmx2g",
        "-cp",
        `${gh}${windows ? ";" : ":"}${planet}`,
        join(repo, "scripts/geodata/ExtractFacilities.java"),
        pbf,
        extraction,
      ],
      "facility-extraction",
    );
  await run(
    process.execPath,
    [
      join(repo, "scripts/geodata/import-facilities.mjs"),
      extraction,
      join(root, "index.sqlite"),
      join(root, "facilities-candidate.sqlite"),
      join(repo, "data/facilities/supplemental.json"),
      ...(existsSync(join(root, "facilities.sqlite"))
        ? [join(root, "facilities.sqlite")]
        : existsSync(join(repo, "dist/server/facilities.sqlite"))
          ? [join(repo, "dist/server/facilities.sqlite")]
          : []),
    ],
    "facility-import",
  );
  log(
    "Standortkandidat erstellt. Datenbericht prüfen; vorhandener veröffentlichter Katalog bleibt unverändert.",
  );
} else if (command === "index") {
  await checkBuildInputs([downloads[1], downloads[2], downloads[3]]);
  await run(
    await javaPath(),
    [
      "-Xmx8g",
      "-cp",
      `${gh}${windows ? ";" : ":"}${planet}`,
      join(repo, "scripts/geodata/BuildIndex.java"),
      pbf,
      join(root, "index.sqlite"),
    ],
    "index-build",
  );
  const source = JSON.parse(
    await readFile(join(root, "source-manifest.json"), "utf8"),
  );
  const index = new DatabaseSync(join(root, "index.sqlite"));
  index
    .prepare(
      "INSERT OR REPLACE INTO metadata(key,value) VALUES('source_sha256',?)",
    )
    .run(source.source.sha256);
  index.close();
} else if (command === "finalize") {
  const source = JSON.parse(
    await readFile(join(root, "source-manifest.json"), "utf8"),
  );
  source.auxiliarySources = [];
  for (const item of auxiliaryDownloads) {
    const path = join(item.directory, item.name);
    const hash = await digest(path);
    if (hash !== item.sha256)
      throw Error(`Kartenzusatzquelle verändert: ${item.name}`);
    source.auxiliarySources.push({
      file: `data/sources/${item.name}`,
      url: item.url,
      sha256: hash,
      bytes: (await stat(path)).size,
    });
  }
  await writeFile(
    join(root, "source-manifest.json"),
    JSON.stringify(source, null, 2) + "\n",
  );
  const index = new DatabaseSync(join(root, "index.sqlite"), {
    readOnly: true,
  });
  index.exec("PRAGMA cache_size=-131072");
  if (
    index.prepare("SELECT value FROM metadata WHERE key='source_sha256'").get()
      ?.value !== source.source.sha256
  )
    throw Error("Suchindex gehört nicht zum freigegebenen PBF-Snapshot.");
  log("Prüfe SQLite-Integrität des vollständigen Orts-/Straßenindex.");
  if (
    index
      .prepare("PRAGMA quick_check")
      .all()
      .some((row) => row.quick_check !== "ok")
  )
    throw Error(
      "Suchindex besteht die abschließende SQLite-Integritätsprüfung nicht.",
    );
  index.close();
  const tiles = new DatabaseSync(join(root, "maps.mbtiles"), {
    readOnly: true,
  });
  tiles.exec("PRAGMA cache_size=-65536");
  const format = tiles
    .prepare("SELECT value FROM metadata WHERE name='format'")
    .get();
  if (format?.value !== "pbf")
    throw Error("MBTiles enthält keine PBF-Vektorkarte.");
  if (
    tiles.prepare("SELECT value FROM metadata WHERE name='source_sha256'").get()
      ?.value !== source.source.sha256
  )
    throw Error("Kacheln gehören nicht zum freigegebenen PBF-Snapshot.");
  log("Prüfe SQLite-Integrität der vollständigen Vektorkarte.");
  if (
    tiles
      .prepare("PRAGMA quick_check")
      .all()
      .some((row) => row.quick_check !== "ok")
  )
    throw Error(
      "Vektorkacheln bestehen die abschließende SQLite-Integritätsprüfung nicht.",
    );
  const graphSource = JSON.parse(
    await readFile(join(root, "graph-source.json"), "utf8"),
  );
  if (
    graphSource.dataset !== source.source.sha256 ||
    graphSource.configSha256 !== (await digest(graphConfig))
  )
    throw Error(
      "Routinggraph gehört nicht zum freigegebenen PBF-Snapshot/Profil.",
    );
  const router = new URL(
    process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989",
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(router.hostname))
    throw Error(
      "finalize prüft ausschließlich den eigenen lokalen Routingdienst.",
    );
  const infoResponse = await fetch(new URL("/info", router), {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!infoResponse.ok)
    throw Error(`Lokaler Routingdienst /info: HTTP ${infoResponse.status}`);
  const info = await infoResponse.json();
  const properties = Object.fromEntries(
    (await readFile(join(root, "graph-cache", "properties.txt"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  if (
    info.version !== "11.0" ||
    !info.import_date ||
    !info.data_date ||
    info.import_date !== properties["datareader.import.date"] ||
    info.data_date !== properties["datareader.data.date"] ||
    !Array.isArray(info.profiles) ||
    info.profiles.length !== 1 ||
    info.profiles[0].name !== "car" ||
    info.elevation !== false ||
    !info.encoded_values?.car_access ||
    !Array.isArray(info.bbox)
  )
    throw Error(
      "Der laufende Router gehört nicht zum lokalen fertigen Graphimport.",
    );
  const graphRuntimeIdentity = Object.fromEntries(
    [
      "version",
      "import_date",
      "data_date",
      "bbox",
      "profiles",
      "elevation",
      "encoded_values",
    ].map((key) => [key, info[key]]),
  );
  const tileCount = tiles.prepare("SELECT count(*) AS n FROM tiles").get().n;
  const tileBounds = tiles
    .prepare("SELECT value FROM metadata WHERE name='bounds'")
    .get()?.value;
  tiles.close();
  log("Berechne SHA256 der fertigen Karten-, Such- und Routingdateien.");
  const artifact = async (file) => ({
    file,
    sha256: await digest(join(root, file)),
    bytes: (await stat(join(root, file))).size,
  });
  const graphFiles = (
    await readdir(join(root, "graph-cache"), { withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && entry.name !== "gh.lock")
    .map((entry) => entry.name)
    .sort();
  if (!graphFiles.includes("properties"))
    throw Error("Routinggraph ist nicht vollständig.");
  const graphArtifacts = [];
  for (const file of graphFiles)
    graphArtifacts.push(await artifact(`graph-cache/${file}`));
  const graph = {
    file: "graph-cache",
    sha256: createHash("sha256")
      .update(JSON.stringify(graphArtifacts))
      .digest("hex"),
    bytes: graphArtifacts.reduce((sum, item) => sum + item.bytes, 0),
    files: graphArtifacts,
  };
  const manifest = {
    schema: 1,
    worldId: "germany-1",
    snapshot: source.snapshot,
    dataset: source.source.sha256,
    bounds: [5.5, 47.1, 15.6, 55.2],
    status: "ready",
    completedAt: new Date().toISOString(),
    attribution: source.attribution,
    license: source.license,
    tileCount,
    tileBounds,
    graphRuntimeIdentity,
    artifacts: {
      tiles: await artifact("maps.mbtiles"),
      index: await artifact("index.sqlite"),
      boundary: await artifact("boundary.geojson"),
      graph,
    },
  };
  await writeFile(
    join(root, "manifest.json.partial"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await rename(
    join(root, "manifest.json.partial"),
    join(root, "manifest.json"),
  );
  log(`Vollständiges Deutschland-Datenpaket: ${manifest.dataset}`);
} else {
  throw Error(
    "Befehl: tools | prepare | graph | serve | tiles | assets | index | finalize",
  );
}
