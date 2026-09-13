import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect, type Page } from "./test";
import { listenBrowserServer, createBrowserServer } from "./server-helper";
import { loginAndEnter, openPanel } from "./ui-navigation";
import { prepared } from "../helpers/patient-transport";
import { saveIndependentFixture } from "../helpers/independent-sites";
import { fixtureFacilities } from "../fixtures/germany/facilities";
import { sites } from "../fixtures/germany/locations";
import { SharedClinics } from "../../src/server/infrastructure/clinics";
import { publicHospitalProfile } from "../../src/simulation/hospital-profiles";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as typeof import("../../src/server/index");
test("gemeinsame Serverklinik: manipulierte Käufe, letztes Bett, echte Alternativfahrt, öffentliche Kapazität und Neustart", async ({
  browser,
}) => {
  const c = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-clinic-browser-")),
    secure: false,
    trustedProxies: [],
  };
  let app = await listenBrowserServer(compiled.startServer, c);
  const password = "Clinics-password-123!",
    ids = await Promise.all(
      ["clinic-a", "clinic-b"].map((n) =>
        app.auth.create(n, password, n, "Klinikprüfung"),
      ),
    );
  const facility = fixtureFacilities.find(
      (f) => f.id === "fixture:hospital:0",
    )!,
    h = publicHospitalProfile({
      id: facility.id,
      name: facility.name,
      ...facility.pos,
      emergency: facility.emergency,
    });
  for (const id of ids) {
    // Real newly created saves have distinct generation UUIDs. Keep each
    // fixture deterministic without duplicating another save's patient IDs.
    const { s, m } = prepared(1, 1, id, id);
    // Keep the scene away from every clinic entrance, including the nearest
    // alternate, so both reservations really remain in transit at restart.
    m.pos = { x: sites[7].x, y: sites[7].y - 40 };
    if (m.location) m.location.access = { ...m.pos };
    for (const v of s.vehicles.filter((v) => v.type === "rtw"))
      v.path = [{ ...m.pos }];
    const p = m.dynamics!.patients[0];
    p.injury = "Unwohlsein";
    p.cprCycles = 0;
    if (m.dynamics!.scenario) m.dynamics!.scenario.patient.intensive = false;
    m.organization = {
      ...m.organization,
      tasks: m.organization?.tasks ?? [],
      hospital: h.id,
    };
    m.clinicWait = {
      until: s.time + 100000,
      reason: "Zeitgesteuerte Testvorbereitung",
    };
    saveIndependentFixture(app.db, id, s);
  }
  const authority = new SharedClinics(app.db.sql),
    at = app.db.all().get(ids[0])!.time;
  // Existing admissions leave exactly one free shared slot. New arrivals below
  // are produced by the packaged game, not inserted as fake patient movements.
  app.db.transaction(() => {
    expect(
      authority.reserve(
        h,
        Array.from({ length: h.capacity - 1 }, (_, i) => ({
          patient: `existing:${i}`,
          departments: ["general"],
        })),
        ids[0],
        "existing",
        "existing",
        at,
      ),
    ).toBe(true);
    authority.admit(ids[0], "existing", h.id, at);
  });
  const contexts = await Promise.all(
    ids.map(() =>
      browser.newContext({ viewport: { width: 1366, height: 768 } }),
    ),
  );
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const reads: { kind: string; bytes: number; ms: number }[] = [],
      errors: string[] = [];
    for (const page of pages) {
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", async (r) => {
        if (r.url().includes("/api/facilities?")) {
          try {
            reads.push({
              kind: new URL(r.url()).searchParams.has("id")
                ? "detail"
                : "search",
              bytes: (await r.body()).length,
              ms: r.request().timing().responseEnd,
            });
          } catch {
            /* aborted UI read */
          }
        }
      });
    }
    const clinicView = async (page: Page, i: number) => {
      await page.goto(c.publicUrl);
      await loginAndEnter(page, `clinic-${i ? "b" : "a"}`, password);
      await openPanel(page, "Standorte kaufen");
      await page.getByLabel("Organisation").selectOption("hospital");
      await page
        .getByLabel("Ort, Adresse oder Standortname")
        .fill(facility.name);
      await page
        .locator(".facility-result")
        .filter({ hasText: facility.name })
        .first()
        .click();
      await expect(
        page.getByRole("region", { name: "Gemeinsame Klinikbetten" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /^Kaufen ·|Kauf verbindlich bestätigen|^Verwalten$/,
        }),
      ).toHaveCount(0);
    };
    await Promise.all(pages.map(clinicView));
    for (const page of pages)
      await expect(page.locator(".clinic-capacity strong")).toHaveText(
        `1 / ${h.capacity} Betten frei`,
      );
    const before = ids.map((id) => app.db.all().get(id)!.money);
    const result = await pages[0].evaluate(async (facility) => {
      const state = await (await fetch("/api/me")).json();
      const response = await fetch("/api/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf,
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          action: { type: "purchase-facility", facility },
        }),
      });
      return { status: response.status, data: await response.json() };
    }, facility.id);
    expect(result.status).toBe(400);
    expect(result.data.error).toContain("Serverkrankenhaus");
    expect(ids.map((id) => app.db.all().get(id)!.money)).toEqual(before);
    for (const id of ids) {
      const s = app.db.all().get(id)!;
      delete s.missions[0].clinicWait;
      app.db.save(id, s);
    }
    app.game.step(1, Date.now(), { generation: false, sharedSituation: false });
    const placements = app.db.sql
      .prepare(
        "SELECT owner,clinic,state FROM clinic_places WHERE mission!='existing'",
      )
      .all();
    expect(placements).toHaveLength(2);
    expect(placements.filter((p) => p.clinic === h.id)).toHaveLength(1);
    expect(
      placements.every((p) => p.state === "reserved"),
      JSON.stringify(placements),
    ).toBe(true);
    for (const id of ids) {
      const s = app.db.all().get(id)!,
        v = s.vehicles.find((v) => v.patients)!;
      expect(v.status).toBe("transport");
      expect(v.path.length).toBeGreaterThan(1);
      expect(v.arrive).toBeGreaterThan(v.depart);
      expect(s.missions[0].dynamics!.patients[0].transport).toBe("aboard");
    }
    for (const page of pages)
      await expect(page.locator(".clinic-capacity strong")).toHaveText(
        `0 / ${h.capacity} Betten frei`,
      );
    const offers = await Promise.all(
      pages.map((p) =>
        p.evaluate(
          async (id) =>
            await (
              await fetch(`/api/facilities?id=${encodeURIComponent(id)}`)
            ).json(),
          facility.id,
        ),
      ),
    );
    expect(offers[0].clinic).toEqual(offers[1].clinic);
    expect(JSON.stringify(offers)).not.toMatch(
      /existing:|"patient"|"password"|"people":\[|clinic-a|clinic-b/,
    );
    await pages[0].screenshot({
      path: ".tools/infrastructure-acceptance/shared-clinic.png",
    });
    await Promise.all(pages.map((p) => p.goto("about:blank")));
    await app.close();
    app = await createBrowserServer(compiled.startServer, c);
    await app.listen();
    expect(
      app.db.sql
        .prepare(
          "SELECT owner,clinic,state FROM clinic_places WHERE mission!='existing'",
        )
        .all(),
    ).toEqual(placements);
    await Promise.all(pages.map(clinicView));
    for (const page of pages)
      await expect(page.locator(".clinic-capacity strong")).toHaveText(
        `0 / ${h.capacity} Betten frei`,
      );
    for (
      let step = 0;
      step < 300 && ids.some((id) => app.db.all().get(id)!.missions.length);
      step++
    )
      app.game.step(5, Date.now(), {
        generation: false,
        sharedSituation: false,
      });
    for (const id of ids) {
      const s = app.db.all().get(id)!;
      expect(s.archive[0].dynamics!.patients[0].transport).toBe("delivered");
      expect(s.vehicles.every((v) => !v.patients)).toBe(true);
    }
    const rewards = ids.map((id) => app.db.all().get(id)!.money);
    app.game.step(30, Date.now(), {
      generation: false,
      sharedSituation: false,
    });
    expect(ids.map((id) => app.db.all().get(id)!.money)).toEqual(rewards);
    expect(errors).toEqual([]);
    await writeFile(
      ".tools/infrastructure-acceptance/clinic-reads.json",
      JSON.stringify(reads, null, 2),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await app.close();
  }
});
