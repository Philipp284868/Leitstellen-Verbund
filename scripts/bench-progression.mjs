import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option("--source", ".")),
  output = resolve(option("--output", ".tools/progression-measurements.json"));
mkdirSync(".tools", { recursive: true });
const bundle = resolve(`.tools/progression-benchmark-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `import {installLogicGeography} from './tests/fixtures/germany/logic-provider'; installLogicGeography();
export * from './src/shared/engine'; export * from './src/shared/model';
export * from './src/shared/progression'; export {missions,vehicles,buildings,extensions,mt,vt} from './src/shared/catalog';
export * from './src/simulation/pacing'; export {attachIncident,callAction} from './src/simulation/calls';
export {alarm,propose} from './src/simulation/dispatch'; export {radioAction} from './src/simulation/incidents';
export {attachDynamics} from './src/simulation/dynamics'; export {attachOrganizations,organizationCommand} from './src/simulation/organizations';
export {sites,fixtureTime} from './tests/fixtures/germany/locations'; export {fixturePurchase} from './tests/fixtures/germany/facilities';`,
    resolveDir: source,
    loader: "ts",
  },
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const api = await import(pathToFileURL(bundle).href);
const samples = [];
const parallel = Number(option("--parallel", "1"));
if (![1, 3].includes(parallel)) throw Error("--parallel muss 1 oder 3 sein.");
const levels = option("--levels", "1,3,5,10,15,20,30,50")
  .split(",")
  .map(Number);
for (const startLevel of levels)
  for (const seed of [124, 811, 2026]) {
    const s = api.fresh("Messung", "Messleitstelle", api.fixtureTime);
    s.player.id = "benchmark";
    s.generation = `benchmark-${seed}-${startLevel}`;
    s.seed = seed;
    s.xp = api.xpForLevel(startLevel);
    api.money(s, 100000000000 - s.money, "Isoliertes Testbudget");
    const desired = [
      "tsf",
      ...(startLevel >= 2 ? ["lf"] : []),
      ...(startLevel >= 3 ? ["tlf"] : []),
      ...(startLevel >= 4 ? ["rtw", "ktw"] : []),
      ...(startLevel >= 6 ? ["hlf"] : []),
      ...(startLevel >= 7 ? ["fustw"] : []),
      ...(startLevel >= 10 ? ["nef", "elw", "dlk"] : []),
      ...(startLevel >= 15 ? ["rw", "gkw", "tmtw"] : []),
      ...(startLevel >= 20 ? ["air", "gwl", "mzgw"] : []),
      ...(startLevel >= 30 ? ["haz", "gwmess"] : []),
    ];
    // Only buy currently unlocked equipment, with its real building/extension prerequisites.
    const procure = (kind) => {
      const t = api.vt(kind);
      if (t.level > startLevel) return;
      let home = s.buildings.find(
        (b) =>
          b.type === t.home &&
          s.vehicles.filter((v) => v.home === b.id).length < 4,
      );
      if (!home) {
        api.apply(
          s,
          api.fixturePurchase(t.home, api.sites[s.buildings.length]),
        );
        home = s.buildings.at(-1);
        api.tick(s, s.time + 30, {}, false, false);
      }
      const extension = api.extensions.find((e) => e.types.includes(kind));
      if (extension && !home.extensions.includes(extension.id)) {
        if (extension.level > startLevel) return;
        api.apply(s, { type: "extension", id: home.id, kind: extension.id });
        api.tick(s, s.time + 200, {}, false, false);
      }
      api.apply(s, { type: "buy", kind, home: home.id });
    };
    for (const kind of desired) procure(kind);
    s.missions = [];
    s.archive = [];
    s.completed = 0;
    s.xp = api.xpForLevel(startLevel);
    const began = s.time,
      entries = [];
    let peak = 0,
      firstRadio = 0;
    const radioIds = new Set();
    const decisions = new Map();
    api.prepareCallPacing(s, 0);
    for (let i = 0; i < (86400 * 3) / 5 && api.level(s) === startLevel; i++) {
      api.tick(s, s.time + 5, {}, false, false);
      api.prepareCallPacing(s, 5);
      if (s.missions.length < parallel && api.mayCreateIncident(s)) {
        const count = s.missions.length;
        api.generate(s);
        if (s.missions.length > count) {
          const m = s.missions.at(-1);
          api.attachIncident(s, m);
          api.attachDynamics(s, m);
          api.attachOrganizations(m);
          api.recordIncidentCreated(s);
        }
      }
      for (const m of s.missions) {
        const call = m.control.calls.find((c) =>
          ["ringing", "active"].includes(c.state),
        );
        if (call) {
          if (call.state === "ringing") {
            if (
              !s.missions.some((other) =>
                other.control.calls.some((c) => c.state === "active"),
              )
            )
              api.callAction(s, m, call.id, "accept", s.player.id);
          } else if (s.time >= call.nextAnswer) {
            const q = ["address", "report"].find(
              (q) => !call.asked.includes(q),
            );
            api.callAction(s, m, call.id, q ? "ask" : "end", s.player.id, q);
          }
        }
        if (m.control.locationKnown && m.control.reportedTemplate) {
          const signature = [
            m.control.briefed,
            m.control.deficit,
            ...s.vehicles
              .filter((v) => !api.readiness(s, v))
              .map((v) => v.id + v.status),
          ].join(":");
          if (decisions.get(m.id) !== signature) {
            decisions.set(m.id, signature);
            api.propose(
              s,
              m,
              {
                id: "benchmark-aao",
                name: "Fähigkeitsdisposition",
                keyword: "Alle",
                level: 1,
                org: "Alle",
                types: [],
                skills: {},
                priority: "NORMAL",
                alarm: "dme",
              },
              s.player.id,
            );
            let selected = m.control.proposal.vehicles;
            if (
              !selected.length &&
              !m.control.briefed &&
              !s.vehicles.some((v) => v.mission === m.id)
            ) {
              const scout = s.vehicles.find((v) => !api.readiness(s, v));
              if (scout) selected = [scout.id]; // Free disposition for an initially vague caller description.
            }
            if (selected.length) api.alarm(s, m, selected, s.player.id);
          }
        }
        for (const r of m.control.radio.filter((r) => r.state === "open"))
          api.radioAction(
            s,
            m,
            r.id,
            r.reason === "arrival" ? "report" : "request",
            s.player.id,
            {},
            r.version,
          );
        if (m.control.briefed)
          for (const t of m.organization?.tasks ?? [])
            if (!t.ordered)
              api.organizationCommand(
                s,
                { type: "organization-task", mission: m.id, task: t.kind },
                s.player.id,
              );
        // Replace genuinely incapacitated crews through the same purchase/dispatch path.
        if (m.control.briefed && s.time - m.created > 900 && i % 60 === 0)
          for (const [skill] of api.missing(m, api.capacity(s, m.id))) {
            const available = api.vehicles
              .filter(
                (v) =>
                  v.level <= startLevel &&
                  v.mode === "road" &&
                  (v.skills[skill] || 0) > 0,
              )
              .sort((a, b) => a.price - b.price);
            const t = available[0];
            if (t && s.vehicles.filter((v) => v.type === t.id).length < 4)
              procure(t.id);
          }
      }
      for (const v of s.vehicles)
        if (v.fault && v.fault.state === "broken")
          api.apply(s, { type: "vehicle-service", vehicle: v.id });
      peak = Math.max(
        peak,
        s.missions.filter((m) => m.phase !== "done").length,
      );
      for (const e of s.radioNetwork?.entries ?? [])
        if (!radioIds.has(e.id)) {
          radioIds.add(e.id);
          if (!e.silent) firstRadio++;
        }
      for (const m of s.archive)
        if (!entries.some((e) => e.id === m.id))
          entries.push({
            id: m.id,
            template: m.template,
            xp: m.telemetry?.xp,
            seconds: m.completed - m.created,
            meters: m.telemetry?.meters,
            quality: m.report?.quality,
            creditsCents: m.telemetry?.credits ?? 0,
            radioMessages: (s.radioNetwork?.entries ?? []).filter(
              (e) => e.mission === m.id && !e.silent && !e.supersededBy,
            ).length,
          });
      if (s.missions.some((m) => s.time - m.created > 7200)) {
        writeFileSync(
          ".tools/progression-stuck.json",
          JSON.stringify(s, null, 2),
        );
        throw Error(
          `Stuck level ${startLevel} seed ${seed}: ${s.missions.map((m) => m.template).join(",")}`,
        );
      }
    }
    if (api.level(s) === startLevel)
      throw Error(`No promotion: ${startLevel}/${seed}`);
    const sample = {
      parallel,
      startLevel,
      seed,
      completed: entries.length,
      elapsedSeconds: s.time - began,
      xp: s.xp - api.xpForLevel(startLevel),
      peak,
      firstRadio,
      incomeCents: entries.reduce((total, e) => total + e.creditsCents, 0),
      entries,
    };
    samples.push(sample);
    console.log(
      JSON.stringify({ ...sample, entries: entries.map((e) => e.template) }),
    );
    writeFileSync(output, JSON.stringify({ source, samples }, null, 2) + "\n");
  }
