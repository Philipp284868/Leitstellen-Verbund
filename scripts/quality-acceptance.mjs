import { build } from "esbuild";
import { resolve } from "node:path";
import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const dir = resolve(
  process.env.QUALITY_SCREENSHOT_DIR || ".tools/screenshots/quality-2.19",
);
mkdirSync(dir, { recursive: true });
const outfile = resolve(".tools/quality-real-server.mjs");
await build({
  entryPoints: ["tests/fixtures/quality-real-server.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  define: { __LV_WORLD__: JSON.stringify("germany-1") },
  plugins: [
    {
      name: "germany",
      setup(b) {
        b.onResolve({ filter: /(?:^|\/)world$/ }, () => ({
          path: resolve("src/germany/world.ts"),
        }));
      },
    },
  ],
});
const child = fork(outfile, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
let browser;
let sequence = 0;
const ipc = (type, values = {}) =>
  new Promise((res, rej) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      child.off("message", receive);
      rej(Error("IPC timeout " + type));
    }, 45000);
    const receive = (message) => {
      if (message.id !== id) return;
      clearTimeout(timer);
      child.off("message", receive);
      if (message.error) rej(Error(message.error));
      else res(message.save);
    };
    child.on("message", receive);
    child.send({ type, id, ...values });
  });
const screenshot = async (page, name) => {
  const notice = page.getByRole("button", {
    name: "Meldung schließen",
    exact: true,
  });
  if (await notice.isVisible()) await notice.click();
  await page.screenshot({ path: resolve(dir, name + ".png") });
};
const camera = (page) =>
  page
    .getByTestId("germany-map-viewport")
    .getAttribute("data-camera")
    .then(JSON.parse);
const center = async (page, point, zoom = 15) => {
  await page.evaluate(
    ({ point, zoom }) =>
      window.dispatchEvent(
        new CustomEvent("lv:map-focus", { detail: { point, zoom } }),
      ),
    { point, zoom },
  );
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(zoom, 2);
};
const comms = async (page) => {
  await page.getByRole("button", { name: "Funk", exact: true }).click();
  await page.getByRole("button", { name: /Verbund & Leitstellenfunk/ }).click();
};
const close = async (page) => {
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
};
try {
  const info = await new Promise((res, rej) => {
    child.once("message", res);
    child.once("exit", (code) => rej(Error("Server exited " + code)));
  });
  browser = await chromium.launch({
    ...(process.env.PW_EDGE === "1" ? { channel: "msedge" } : {}),
    headless: true,
  });
  const pages = [];
  for (const username of [
    "quality-main",
    "quality-neighbor",
    "quality-member",
    "quality-new",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    pages.push(page);
    await page.goto(info.origin);
    await page.getByLabel("Benutzername", { exact: true }).fill(username);
    await page.getByLabel("Passwort", { exact: true }).fill(info.password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Spielen", exact: true }),
    ).toBeVisible();
  }
  const page = pages[0];
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGEERROR", e.stack);
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("BROWSER", m.text());
  });
  await page.screenshot({ path: resolve(dir, "hauptmenue-1920.png") });
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(page.getByTestId("germany-map-viewport")).toBeVisible();
  await expect(page.getByText("Deutschlandkarte wird geladen …")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("map-presence")).not.toHaveCount(0);
  const measurements = [];
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(
      () =>
        new Promise((res) =>
          requestAnimationFrame(() => requestAnimationFrame(res)),
        ),
    );
    measurements.push(
      await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        scroll: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
        bar: document.querySelector(".topbar").getBoundingClientRect().toJSON(),
        map: document
          .querySelector(".map-column")
          .getBoundingClientRect()
          .toJSON(),
        navigation: document
          .querySelector(".topbar-navigation")
          .getBoundingClientRect()
          .toJSON(),
        status: document
          .querySelector(".topbar-status")
          .getBoundingClientRect()
          .toJSON(),
      })),
    );
    await screenshot(page, `spielansicht-${size.width}`);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: "Spieler", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("4 Spieler");
  await page.screenshot({ path: resolve(dir, "spielerliste.png") });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  const neighbor = pages[1];
  await neighbor.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(neighbor.getByTestId("map-presence")).not.toHaveCount(0);
  const neighborCamera = await camera(neighbor);
  await page.getByRole("button", { name: "Spieler", exact: true }).click();
  await page.getByLabel("Spieler suchen").fill("Jonas");
  await page.getByRole("button", { name: /Auf Karte zeigen/ }).click();
  await expect.poll(async () => (await camera(page)).lon).toBeLessThan(13.36);
  expect(await camera(neighbor)).toEqual(neighborCamera);
  let state = await ipc("save");
  await center(page, state.buildings[0].pos, 13);
  await page
    .getByTestId("map-presence")
    .filter({ hasText: "2" })
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Spieler am Kartenstandort" }),
  ).toContainText("Lea Fischer");
  await screenshot(page, "mitspieler");
  await page.getByRole("button", { name: "Spielerdetails schließen" }).click();
  await center(page, state.buildings[0].pos, 16);
  await page.getByTestId("map-vehicle").filter({ hasText: "5" }).click();
  await expect(page.locator(".map-object-list button")).toHaveCount(5);
  await screenshot(page, "fahrzeugicons");
  await page.getByRole("button", { name: "Objektgruppe schließen" }).click();
  await page.getByTestId("map-station").first().click();
  await expect(page.getByRole("dialog")).toContainText("Eigene Wache");
  await screenshot(page, "gebaeudedetails");
  await close(page);
  const geo = { lon: 13.4152219, lat: 52.5170835 };
  const r = Math.PI / 180,
    R = 6371008.8,
    scale = Math.cos(51 * r);
  const geoPoint = {
    x: (R * scale * (geo.lon - 5.5) * r) / 12,
    y:
      (R *
        scale *
        (Math.log(Math.tan(Math.PI / 4 + (55.2 * r) / 2)) -
          Math.log(Math.tan(Math.PI / 4 + (geo.lat * r) / 2)))) /
      12,
  };
  await center(page, geoPoint, 17);
  const mapBox = await page.getByTestId("germany-map-viewport").boundingBox();
  await expect
    .poll(
      async () => {
        await page.mouse.click(
          mapBox.x + mapBox.width / 2,
          mapBox.y + mapBox.height / 2,
        );
        return page
          .getByRole("complementary", { name: "Geografische Einrichtung" })
          .count();
      },
      { timeout: 10000 },
    )
    .toBe(1);
  await expect(
    page.getByRole("complementary", { name: "Geografische Einrichtung" }),
  ).toContainText("Feuerwache");
  await screenshot(page, "gebaeudeicons");
  await page
    .getByRole("button", { name: "Einrichtungsdetails schließen" })
    .click();
  await center(page, state.buildings[0].pos, 13);
  await page
    .getByRole("button", { name: "Einsatzliste ausklappen", exact: true })
    .click();
  await page.locator(".mission-card").first().click();
  await screenshot(page, "notruf");
  await page
    .getByRole("button", { name: "Notruf annehmen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Wo genau ist der Notfall?", exact: true })
    .click();
  await expect(page.locator(".known-facts")).toContainText(/bestätigt/);
  await ipc("advance", { seconds: 5 });
  await page
    .getByRole("button", { name: "Was ist passiert?", exact: true })
    .click();
  await expect(page.locator(".dispatch-list")).toBeVisible();
  await page
    .getByRole("button", { name: "Gespräch beenden", exact: true })
    .click();
  await page
    .locator(".dispatch-list label")
    .filter({ hasText: "HLF 20" })
    .locator("input")
    .check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(async () => (await ipc("save")).vehicles[0].status)
    .toBe("alarmed");
  state = await ipc("save");
  const mission = state.missions[0].id;
  const startMoney = state.money;
  const startXp = state.xp;
  const alarm = state.vehicles[0];
  expect(alarm.arrive).toBeGreaterThan(alarm.depart);
  expect(alarm.journey.plannedSeconds).toBeGreaterThan(0);
  await ipc("advance", { seconds: Math.max(0, alarm.depart - state.time) + 1 });
  await expect(page.locator(".incident-desk")).toContainText("FMS 3");
  await page.getByRole("button", { name: "Anfahrt", exact: true }).click();
  await screenshot(page, "disposition");
  state = await ipc("save");
  await ipc("advance", { seconds: state.vehicles[0].arrive - state.time + 1 });
  await page
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await expect(page.locator(".dock-heading strong")).toHaveText("Flächenbrand");
  await expect(page.locator(".radio-queue")).toContainText(
    "1× TLF 2000 oder gleichwertige Kräfte",
  );
  await page
    .getByRole("button", { name: "Nachforderung bearbeiten", exact: true })
    .click();
  await close(page);
  await comms(page);
  await comms(neighbor);
  await page.getByText("Neue Unterstützungsanfrage", { exact: true }).click();
  await page
    .getByLabel("Nachbarleitstelle", { exact: true })
    .selectOption(info.ids[1]);
  await page
    .getByLabel("Eigener Einsatz", { exact: true })
    .selectOption(mission);
  await page.getByLabel("Gewünschter Fahrzeugtyp").selectOption("tlf");
  await page
    .getByRole("button", { name: "Fahrzeug zur Anforderung hinzufügen" })
    .click();
  await page
    .getByLabel("Anfragetext")
    .fill("Bestätigter Flächenbrand: TLF zur zusätzlichen Wasserversorgung.");
  await page
    .getByRole("button", { name: "Entwurf anlegen", exact: true })
    .click();
  await expect(neighbor.locator(".aid-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Anfrage verbindlich senden" })
    .click();
  await expect(neighbor.locator(".aid-card")).toHaveCount(1);
  await neighbor.locator(".aid-vehicles input").check();
  await neighbor
    .getByRole("button", { name: "Ausgewählte Kräfte alarmieren" })
    .click();
  await expect(page.locator(".aid-card")).toContainText("1 / 1 zugesagt");
  await screenshot(page, "unterstuetzung");
  await neighbor.context().close();
  await close(page);
  await ipc("restart");
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await page
    .getByRole("button", { name: "Einsatzliste ausklappen", exact: true })
    .click();
  await page.locator(".mission-card").first().click();
  let completed;
  for (let i = 0; i < 20; i++) {
    state = await ipc("advance", { seconds: 60 });
    completed = state.archive.find((m) => m.id === mission);
    if (completed) break;
  }
  expect(
    completed,
    "Target incident must complete through real server simulation and routed aid",
  ).toBeTruthy();
  await expect(page.locator(".incident-history")).toContainText(
    "Einsatz abgeschlossen",
  );
  await expect(
    page.getByRole("button", { name: "Bericht als JSON", exact: true }),
  ).toBeVisible();
  await page.locator(".dock-content").evaluate((el) => {
    el.scrollTop = 0;
  });
  await screenshot(page, "einsatzbericht");
  expect(state.money).toBeGreaterThan(startMoney);
  expect(state.xp).toBeGreaterThan(startXp);
  const money = state.money,
    xp = state.xp;
  const completionEvents = completed.control.events.filter(
    (e) =>
      e.type === "COMPLETED" || e.text.startsWith("Einsatz abgeschlossen:"),
  );
  expect(completionEvents).toHaveLength(1);
  state = await ipc("advance", { seconds: 60 });
  expect(state.money).toBe(money);
  expect(state.xp).toBe(xp);
  await close(page);
  await page
    .getByRole("button", { name: "Einsatzliste einklappen", exact: true })
    .click();
  await center(page, state.buildings[0].pos, 13);
  await screenshot(page, "spielansicht-1920");
  await page.context().setOffline(true);
  await expect(
    page.getByText("Serververbindung unterbrochen.", { exact: false }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByText("Serververbindung unterbrochen.", { exact: false }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  state = await ipc("save");
  expect(state.money).toBe(money);
  expect(state.xp).toBe(xp);
  expect(state.archive.filter((m) => m.id === mission)).toHaveLength(1);
  const report = {
    measurements,
    errors,
    route: {
      seconds: alarm.journey.plannedSeconds,
      depart: alarm.depart,
      arrive: alarm.arrive,
    },
    completed: {
      id: mission,
      moneyBefore: startMoney,
      moneyAfter: money,
      xpBefore: startXp,
      xpAfter: xp,
      events: completionEvents.length,
    },
    presence: {
      players: 4,
      unplaced: 1,
      sameDesk: 2,
      independentCameras: true,
    },
    realRouter: true,
    restart: true,
    offlineReconnect: true,
  };
  writeFileSync(
    ".tools/test-runs/quality-screen-layout.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  expect(errors).toEqual([]);
} catch (error) {
  if (browser) {
    const p = browser.contexts()[0]?.pages()[0];
    if (p) {
      await p.screenshot({ path: resolve(dir, "debug-failure.png") });
      writeFileSync(
        ".tools/quality-browser-failure.txt",
        await p.locator("body").innerText(),
      );
    }
  }
  throw error;
} finally {
  await browser?.close();
  if (child.connected) child.send({ type: "shutdown" });
}
