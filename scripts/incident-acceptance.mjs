import { build } from "esbuild";
import { resolve } from "node:path";
import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { motionAt } from "../src/shared/motion.ts";

const dir = resolve(
  process.env.INCIDENT_SCREENSHOT_DIR || "docs/screenshots/2.20",
);
const evidence = resolve(
  process.env.INCIDENT_EVIDENCE ||
    "docs/quality-evidence/incident-real-2.20.json",
);
mkdirSync(dir, { recursive: true });
mkdirSync(resolve(".tools/test-runs"), { recursive: true });
mkdirSync(resolve("docs/quality-evidence"), { recursive: true });
const outfile = resolve(".tools/test-runs/incident-real-server.mjs");
await build({
  entryPoints: ["tests/fixtures/incident-real-server.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const child = fork(outfile, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
const ready = new Promise((done, reject) => {
  child.once("message", done);
  child.once("exit", (code) => reject(Error("Fixture exited " + code)));
});
let browser,
  sequence = 0;
const ipc = (type, values = {}) =>
  new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      child.off("message", receive);
      reject(Error("IPC timeout " + type));
    }, 45000);
    const receive = (message) => {
      if (message.id !== id) return;
      clearTimeout(timer);
      child.off("message", receive);
      if (message.error) reject(Error(message.error));
      else done(message);
    };
    child.on("message", receive);
    child.send({ type, id, ...values });
  });
const state = async () => (await ipc("save")).save;
const photo = async (page, name) => {
  const dismiss = page.getByRole("button", {
    name: "Meldung schließen",
    exact: true,
  });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  await page.screenshot({
    path: resolve(dir, name + ".png"),
    animations: "disabled",
  });
};
const focus = async (page, point, zoom = 14) => {
  await page.evaluate(
    ({ point, zoom }) =>
      window.dispatchEvent(
        new CustomEvent("lv:map-focus", { detail: { point, zoom } }),
      ),
    { point, zoom },
  );
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"),
        ).zoom,
    )
    .toBeCloseTo(zoom, 2);
};
const showList = async (page) => {
  const show = page.getByRole("button", {
    name: "Einsatzliste ausklappen",
    exact: true,
  });
  if (await show.isVisible()) await show.click();
};
const openUnknown = async (page) => {
  await showList(page);
  await page
    .locator(".mission-card")
    .filter({ hasText: "Ungeklärter Notruf" })
    .click();
};
const interview = async (page) => {
  await page
    .getByRole("button", { name: "Notruf annehmen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Wo genau ist der Notfall?", exact: true })
    .click();
  await ipc("advance", { seconds: 5 });
  await page
    .getByRole("button", { name: "Was ist passiert?", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gespräch beenden", exact: true })
    .click();
};
const choose = (page, type) =>
  page
    .locator(".dispatch-list label")
    .filter({ hasText: type })
    .locator("input")
    .check();
const closeDetail = async (page) => {
  const close = page
    .locator(".incident-dock")
    .getByRole("button", { name: "Schließen", exact: true });
  if (await close.isVisible()) await close.click();
};
try {
  const info = await ready;
  browser = await chromium.launch({
    ...(process.env.PW_EDGE === "1" ? { channel: "msedge" } : {}),
    headless: true,
  });
  const pages = [],
    errors = [];
  for (const name of ["incident-main", "incident-member"]) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("PAGEERROR", error.stack);
    });
    pages.push(page);
    await page.goto(info.origin);
    await page.getByLabel("Benutzername", { exact: true }).fill(name);
    await page.getByLabel("Passwort", { exact: true }).fill(info.password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(page.getByTestId("germany-map-viewport")).toBeVisible();
    await expect(page.getByText("Deutschlandkarte wird geladen …")).toHaveCount(
      0,
    );
  }
  const page = pages[0],
    member = pages[1];
  await openUnknown(page);
  const unknown = await page.evaluate(
    async () => (await (await fetch("/api/me")).json()).save.missions[0],
  );
  expect(unknown.template).toBe("incoming");
  expect(unknown).not.toHaveProperty("dynamics");
  expect(unknown.control).not.toHaveProperty("secret");
  await expect(page.locator(".dock-heading strong")).toHaveText(
    "Ungeklärter Notruf",
  );
  await expect(page.getByTestId("fire-live")).toHaveCount(0);
  await photo(page, "01-neutraler-notruf");
  await interview(page);
  let save = await state();
  expect(save.missions[0].control.reportedTemplate).toBe("reported-fire");
  expect(save.missions[0].control.briefed).toBe(false);
  await focus(page, save.missions[0].pos);
  await choose(page, "TLF");
  await choose(page, "DLK");
  await photo(page, "02-brandverdacht-tlf-disposition");
  await page
    .getByRole("button", { name: "Alarmieren (2)", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).vehicles.filter((v) => v.status === "alarmed").length,
    )
    .toBe(2);
  save = await state();
  const tlf = save.vehicles.find((v) => v.type === "tlf"),
    dlk = save.vehicles.find((v) => v.type === "dlk");
  const routes = [tlf, dlk].map((v) => ({
    type: v.type,
    plannedSeconds: v.journey.plannedSeconds,
    actualScheduledSeconds: v.arrive - v.depart,
    vertices: v.path.length,
  }));
  expect(save.vehicles.find((v) => v.type === "hlf").mission).toBeNull();
  expect(routes.every((r) => r.vertices > 2 && r.plannedSeconds > 0)).toBe(
    true,
  );
  await ipc("advance", {
    seconds: Math.max(tlf.depart, dlk.depart) - save.time + 1,
  });
  for (const vehicle of ["TLF", "DLK"]) {
    await expect(
      page.locator(".dispatch-list label").filter({ hasText: vehicle }),
    ).toContainText("FMS 3");
  }
  await photo(page, "03-echte-strassenanfahrt");
  save = await state();
  await ipc("advance", {
    seconds:
      Math.max(
        ...save.vehicles
          .filter((v) => v.mission === info.first)
          .map((v) => v.arrive),
      ) -
      save.time +
      1,
  });
  await page
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await expect(page.getByTestId("fire-live")).toBeVisible();
  await expect(page.locator(".dock-heading strong")).toHaveText(
    "Müllbehälterbrand",
  );
  await photo(page, "04-bestaetigte-brandentwicklung");
  const intensities = [];
  let first;
  for (let i = 0; i < 65; i++) {
    save = (await ipc("advance", { seconds: 10 })).save;
    first = save.missions.find((m) => m.id === info.first);
    if (!first)
      throw Error("Fixture incident finished before residual work was checked");
    intensities.push(first.dynamics.fire.intensity);
    if (
      first.dynamics.fire.extinguishedAt !== undefined &&
      first.tasks.entries.find((t) => t.id === "fire-aftercare")?.done
    )
      break;
  }
  expect(first.dynamics.fire.intensity).toBe(0);
  expect(
    first.tasks.entries.find((t) => t.id === "fixture-ladder-work").done,
  ).toBe(false);
  await expect(page.getByTestId("fire-live")).toContainText("Feuer gelöscht");
  await page.getByTestId("fire-live").scrollIntoViewIfNeeded();
  await photo(page, "05-feuer-geloescht-restaufgaben");
  const withdrawal = page
    .getByTestId("incident-units")
    .locator("article")
    .filter({ hasText: "TLF" })
    .getByRole("button", { name: "Zurückschicken", exact: true });
  await expect(withdrawal).toBeEnabled();
  await withdrawal.click();
  await expect
    .poll(
      async () => (await state()).vehicles.find((v) => v.id === tlf.id).status,
    )
    .toBe("return");
  await ipc("advance", { seconds: 5 });
  save = await state();
  const returning = save.vehicles.find((v) => v.id === tlf.id);
  expect(save.desk.fleet[tlf.id].code).toBe(1);
  expect(returning.mission).toBeNull();
  expect(save.vehicles.find((v) => v.id === dlk.id).mission).toBe(info.first);
  const returningRow = page
    .locator(".dispatch-list label")
    .filter({ hasText: "TLF" });
  await returningRow.scrollIntoViewIfNeeded();
  await expect(returningRow).toContainText("0 s Ausrücken");
  const taskProgress = page.locator(".incident-dock").getByRole("progressbar", {
    name: "Erledigte Einsatzaufgaben · 2/3",
    exact: true,
  });
  await expect(taskProgress).toHaveAttribute("value", "2");
  await expect(taskProgress).toHaveAttribute("max", "3");
  await expect(
    page
      .locator(".incident-dock")
      .getByText("Erledigte Einsatzaufgaben · 2/3", { exact: true }),
  ).toBeVisible();
  await photo(page, "06-tlf-frei-restarbeiten-bleiben");
  await ipc("scenario", { scenario: "fire" });
  await openUnknown(page);
  await interview(page);
  const beforeRedirect = await state(),
    oldTrip = beforeRedirect.vehicles.find((v) => v.id === tlf.id);
  expect(oldTrip.status).toBe("return");
  await choose(page, "TLF");
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(
      async () => (await state()).vehicles.find((v) => v.id === tlf.id).status,
    )
    .toBe("travel");
  save = await state();
  const redirected = save.vehicles.find((v) => v.id === tlf.id),
    second = save.missions.find((m) => m.id === redirected.mission);
  const assignedAt = second.control.events.find(
    (e) => e.type === "ALARM_STARTED",
  ).at;
  const exactOrigin = motionAt(
    oldTrip.journey.motion,
    assignedAt - oldTrip.depart - (oldTrip.journey.wait ?? 0),
  ).position;
  expect(redirected.path[0]).toEqual(exactOrigin);
  expect(redirected.depart).toBe(assignedAt);
  expect(save.desk.fleet[tlf.id].code).toBe(3);
  expect(redirected.turnout).toBeUndefined();
  expect(
    save.people.filter((p) => p.vehicle === tlf.id).map((p) => p.id),
  ).toEqual(
    beforeRedirect.people.filter((p) => p.vehicle === tlf.id).map((p) => p.id),
  );
  await photo(page, "07-folgealarm-von-aktueller-strasse");
  await ipc("scenario", { scenario: "medical" });
  await openUnknown(page);
  await interview(page);
  save = await state();
  const medical = save.missions.find((m) => m.template === "sick");
  expect(medical.control.reportedTemplate).toBe("reported-medical");
  await focus(page, medical.pos, 15);
  const marker = page.locator(
    `[data-testid="map-mission"][data-object-id="${medical.id}"]`,
  );
  await expect(marker).toHaveAttribute("data-category", "medical");
  await expect(marker).toHaveCSS("background-color", "rgb(37, 132, 95)");
  const priority = page.getByLabel("Dispositionspriorität", { exact: true });
  await priority.selectOption("NOTFALL");
  await expect(priority).toHaveValue("NOTFALL");
  await expect(marker.locator(".marker-urgency")).toBeVisible();
  await expect(marker.locator(".marker-urgency")).toHaveAttribute(
    "aria-label",
    "Notfall",
  );
  await expect(marker).toHaveCSS("background-color", "rgb(37, 132, 95)");
  await expect
    .poll(
      async () =>
        (await state()).missions.find((m) => m.id === medical.id).control
          .priority,
    )
    .toBe("NOTFALL");
  await photo(page, "08-medizinischer-einsatz-gruen");
  const beforeFault = await ipc("save");
  await ipc("fault");
  save = await state();
  const broken = save.vehicles.find((v) => v.id === tlf.id);
  expect(broken.fault.state).toBe("repairing");
  const preFaultTrip = beforeFault.save.vehicles.find((v) => v.id === tlf.id);
  const faultOrigin = motionAt(
    preFaultTrip.journey.motion,
    broken.fault.since - preFaultTrip.depart - (preFaultTrip.journey.wait ?? 0),
  ).position;
  expect(broken.fault.position).toEqual(faultOrigin);
  expect(save.desk.fleet[tlf.id].code).toBe(6);
  const repairAt = broken.fault.repairAt,
    assignment = broken.assignment;
  await closeDetail(page);
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(page.locator(".fault-card")).toContainText(
    "Automatische Behebung",
  );
  await page.locator(".fault-card").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Reparatur beauftragen" }),
  ).toHaveCount(0);
  await photo(page, "09-automatische-stoerungsbehebung");
  await ipc("restart");
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  save = await state();
  expect(save.vehicles.find((v) => v.id === tlf.id).fault.repairAt).toBe(
    repairAt,
  );
  expect(save.vehicles.find((v) => v.id === tlf.id).assignment).toBe(
    assignment,
  );
  await ipc("advance", { seconds: Math.max(0, repairAt - save.time) + 1 });
  save = await state();
  const repaired = save.vehicles.find((v) => v.id === tlf.id);
  expect(repaired.fault.state).toBe("repaired");
  expect(repaired.assignment).toBe(assignment);
  expect(repaired.mission).toBe(second.id);
  expect(repaired.path[0]).toEqual(broken.fault.position);
  expect([3, 4, 5]).toContain(save.desk.fleet[tlf.id].code);
  expect(
    save.missions.find((m) => m.id === info.first).dynamics.fire.intensity,
  ).toBe(0);
  await focus(page, medical.pos, 15);
  const restartedMedicalMarker = page.locator(
    `[data-testid="map-mission"][data-object-id="${medical.id}"]`,
  );
  await expect(restartedMedicalMarker).toHaveCSS(
    "background-color",
    "rgb(37, 132, 95)",
  );
  await expect(restartedMedicalMarker.locator(".marker-urgency")).toBeVisible();
  const repairedMarker = page.locator(
    `[data-testid="map-vehicle"][data-object-id="${tlf.id}"]`,
  );
  await expect(repairedMarker.locator(".marker-fms")).toHaveText(
    String(save.desk.fleet[tlf.id].code),
  );
  await expect(repairedMarker.locator(".marker-fault")).toHaveCount(0);
  await photo(page, "10-neustart-fortsetzung");
  await page.context().setOffline(true);
  await expect(
    page.getByText("Serververbindung unterbrochen.", { exact: false }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByText("Serververbindung unterbrochen.", { exact: false }),
  ).toHaveCount(0);
  await member.reload();
  await member.getByRole("button", { name: "Spielen", exact: true }).click();
  const memberView = await member.evaluate(
    async () => (await (await fetch("/api/me")).json()).save,
  );
  expect(memberView.vehicles.find((v) => v.id === tlf.id).assignment).toBe(
    assignment,
  );
  const report = {
    at: new Date().toISOString(),
    version: "2.20",
    realGeodata: true,
    realGraphHopper: true,
    routes,
    neutralCall: {
      template: unknown.template,
      secretAbsent: !unknown.control.secret,
      dynamicsAbsent: !unknown.dynamics,
    },
    firstIncident: {
      id: info.first,
      fireIntensities: intensities,
      extinguished: true,
      residualTaskStillOpenAtWithdrawal: true,
      visibleCompletedTasks: 2,
      visibleTotalTasks: 3,
      usedFireVehicle: "tlf",
      hlfUsed: false,
    },
    redirect: {
      from: exactOrigin,
      routeStart: redirected.path[0],
      turnoutSeconds: redirected.depart - assignedAt,
      previewTurnoutSeconds: 0,
      crewPreserved: true,
      fms: 3,
      assignment,
    },
    medical: {
      id: medical.id,
      color: "#25845f",
      priority: "NOTFALL",
      visiblePriorityConfirmed: true,
      visibleUrgencyBadgeConfirmed: true,
      emergencyPriorityPreservesGreen: true,
    },
    fault: {
      kind: broken.fault.kind,
      seconds: repairAt - broken.fault.since,
      position: broken.fault.position,
      deadlinePersisted: true,
      automaticCompletion: true,
      assignmentPreserved: true,
    },
    sameDeskDispatcher: true,
    restart: true,
    offlineReconnect: true,
    errors,
  };
  writeFileSync(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  expect(errors).toEqual([]);
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: resolve(".tools/test-runs/incident-debug-failure.png"),
    });
    writeFileSync(
      ".tools/test-runs/incident-browser-failure.txt",
      await page.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  if (child.connected) child.send({ type: "shutdown" });
}
