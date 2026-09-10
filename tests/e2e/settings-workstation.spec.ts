import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { phaseFixture } from "../dispatch-fixture";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Locator, type Page } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
const password = "Settings-browser-regression-284!";
test.use({ viewport: { width: 1366, height: 768 }, actionTimeout: 12000 });
test.beforeAll(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-settings-workstation-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
});
test.afterAll(async () => await app.close());

async function login(page: Page, play = false) {
  const username = `settings-${crypto.randomUUID().slice(0, 8)}`;
  const owner = await app.auth.create(
    username,
    password,
    "Arbeitsplatz",
    "Leitstelle Einstellungen",
  );
  const save = phaseFixture(owner);
  save.missions = [];
  save.missionWait = 100000;
  save.nextMission = save.time + 100000;
  app.db.save(owner, save);
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.locator(".command-menu")).toBeVisible();
  if (play) {
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(
      page.locator("[data-testid=germany-map-viewport]"),
    ).toBeVisible();
  }
  return owner;
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Einstellungen",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function stored(page: Page) {
  return page.evaluate(() => ({
    device: localStorage.getItem("lv-device-v2"),
    audio: localStorage.getItem("lv-audio-v1"),
  }));
}
async function pinned(dialog: Locator) {
  const result = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const panel = element.querySelector<HTMLElement>(".settings-content")!;
    const body = element.querySelector<HTMLElement>(".modal-body")!;
    const nodes = [
      ...element.querySelectorAll<HTMLElement>(
        ".section-tabs button, .settings-actions button",
      ),
    ];
    return {
      panelHeight: panel.clientHeight,
      panelWidth: panel.clientWidth,
      panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
      bodyScroll: body.scrollTop,
      modalScroll: element.scrollTop,
      controls: nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return {
          text: node.textContent,
          font: Number.parseFloat(getComputedStyle(node).fontSize),
          visible:
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom &&
            rect.bottom <= innerHeight,
          clickable: hit === node || (!!hit && node.contains(hit)),
        };
      }),
    };
  });
  expect(result.panelHeight).toBeGreaterThan(150);
  expect(result.panelWidth).toBeGreaterThan(500);
  expect(result.panelOverflow).toBe(false);
  expect(result.bodyScroll).toBe(0);
  expect(result.modalScroll).toBe(0);
  for (const control of result.controls) {
    expect(control.visible, control.text ?? "control").toBe(true);
    expect(control.clickable, control.text ?? "control").toBe(true);
    expect(control.font).toBeGreaterThanOrEqual(15);
  }
}
const checks = [
  "Helle Oberfläche",
  "Bewegung reduzieren",
  "Ortsbeschriftungen",
  "Fahrwege anzeigen",
  "Geografische Einrichtungen",
  "Andere Leitstellen anzeigen",
  "Freigegebene Verbundobjekte",
] as const;
const keyLabels = [
  "Nächster Notruf",
  "FMS",
  "Disposition öffnen",
  "Fahrzeuge",
  "Einsätze",
  "Polizeieinsätze",
  "Rettungsdiensteinsätze",
  "Archiv und Statistik",
] as const;

test("alle Anzeige-, Steuerungs- und Hinweisfelder speichern; 120-Prozent-Lightmode bleibt mit festen Kategorien und Aktionen lesbar", async ({
  page,
}, info) => {
  await login(page);
  let dialog = await settings(page);
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await dialog
    .getByLabel("Oberflächentext", { exact: true })
    .selectOption("120");
  await dialog.getByLabel("Kartensymbole", { exact: true }).selectOption("140");
  for (const label of checks) {
    const input = dialog.getByRole("checkbox", { name: label, exact: true });
    await input.setChecked(!(await input.isChecked()));
  }
  await pinned(dialog);
  await dialog
    .locator(".settings-content")
    .evaluate((node) => (node.scrollTop = node.scrollHeight));
  await pinned(dialog);
  await page.screenshot({
    path: info.outputPath("settings-display-light-120.png"),
  });
  const contrast = await dialog.evaluate((element) => {
    function luminance(color: string) {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          const v = n / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    return [
      ".setting-row strong",
      ".setting-row small",
      "header button",
      "header .eyebrow",
      ".section-tabs button[aria-selected=true]",
      ".settings-actions button.primary",
    ].map((selector) => {
      const node = element.querySelector<HTMLElement>(selector)!;
      let background: HTMLElement | null = node;
      while (
        background &&
        getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)"
      )
        background = background.parentElement;
      const fg = luminance(getComputedStyle(node).color);
      const bg = luminance(getComputedStyle(background!).backgroundColor);
      return {
        selector,
        ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      };
    });
  });
  await info.attach("Kontraste der hellen Einstellungen", {
    body: JSON.stringify(contrast, null, 2),
    contentType: "application/json",
  });
  for (const item of contrast)
    expect(item.ratio, item.selector).toBeGreaterThanOrEqual(4.5);
  await dialog.getByRole("tab", { name: "Steuerung", exact: true }).click();
  await dialog
    .getByLabel("Mausrad-Empfindlichkeit", { exact: true })
    .selectOption("150");
  await dialog
    .getByRole("checkbox", {
      name: "Ausgewähltem Fahrzeug folgen",
      exact: true,
    })
    .check();
  await dialog
    .getByLabel("Einsatzspalte", { exact: true })
    .selectOption("right");
  await dialog
    .getByLabel("Breite der Einsatzspalte", { exact: true })
    .selectOption("380");
  await dialog
    .getByRole("checkbox", { name: "Kompakte Einsatzkarten", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", {
      name: "Notruf- und Funkübersicht unter der Einsatzliste",
      exact: true,
    })
    .check();
  for (const [i, name] of keyLabels.entries())
    await dialog.getByLabel(`Taste: ${name}`, { exact: true }).fill(String(i));
  await dialog
    .locator(".settings-content")
    .evaluate((node) => (node.scrollTop = node.scrollHeight));
  await pinned(dialog);
  await page.screenshot({
    path: info.outputPath("settings-controls-light-120.png"),
  });
  await dialog.getByRole("tab", { name: "Hinweise & Hilfe" }).click();
  await dialog
    .getByRole("checkbox", { name: "Tutorialhinweise einblenden", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", {
      name: "Zusammenfassung nach Wiederverbindung",
      exact: true,
    })
    .uncheck();
  expect((await stored(page)).device).toBeNull();
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.locator(".settings-view > [role=status]")).toContainText(
    "Alle Änderungen gespeichert",
  );
  const persisted = (await stored(page)).device;
  expect(JSON.parse(persisted!)).toMatchObject({
    version: 2,
    scale: 120,
    markerSize: 140,
    light: true,
    reduced: true,
    labels: false,
    routes: false,
    pois: false,
    players: false,
    friends: false,
    zoomSensitivity: 150,
    follow: true,
    tutorialHints: false,
    reconnectSummary: false,
    workspace: {
      side: "right",
      width: 380,
      compact: true,
      queueBottom: true,
      keys: {
        call: "0",
        fms: "1",
        alarm: "2",
        fleet: "3",
        missions: "4",
        police: "5",
        ems: "6",
        archive: "7",
      },
    },
  });
  await page.reload();
  dialog = await settings(page);
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await expect(
    dialog.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("120");
  await expect(dialog.getByLabel("Kartensymbole", { exact: true })).toHaveValue(
    "140",
  );
  for (const label of checks)
    await expect(
      dialog.getByRole("checkbox", { name: label, exact: true }),
    ).toBeChecked({
      checked: ["Helle Oberfläche", "Bewegung reduzieren"].includes(label),
    });
  await dialog.getByRole("tab", { name: "Steuerung", exact: true }).click();
  for (const [label, value] of [
    ["Mausrad-Empfindlichkeit", "150"],
    ["Einsatzspalte", "right"],
    ["Breite der Einsatzspalte", "380"],
  ])
    await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
  for (const label of [
    "Ausgewähltem Fahrzeug folgen",
    "Kompakte Einsatzkarten",
    "Notruf- und Funkübersicht unter der Einsatzliste",
  ])
    await expect(
      dialog.getByRole("checkbox", { name: label, exact: true }),
    ).toBeChecked();
  for (const [i, name] of keyLabels.entries())
    await expect(
      dialog.getByLabel(`Taste: ${name}`, { exact: true }),
    ).toHaveValue(String(i));
  await dialog.getByRole("tab", { name: "Hinweise & Hilfe" }).click();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Tutorialhinweise einblenden",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Zusammenfassung nach Wiederverbindung",
      exact: true,
    }),
  ).not.toBeChecked();
  await pinned(dialog);
  expect((await stored(page)).device).toBe(persisted);
});

test("Standardwerte und Arbeitsplatz-Reset sind verwerfbare Vorschauen; Audio bleibt innen scrollbar", async ({
  page,
}, info) => {
  await login(page);
  const dialog = await settings(page);
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await dialog
    .getByLabel("Oberflächentext", { exact: true })
    .selectOption("120");
  await dialog.getByLabel("Kartensymbole", { exact: true }).selectOption("140");
  await dialog.getByRole("tab", { name: "Steuerung", exact: true }).click();
  await dialog
    .getByLabel("Einsatzspalte", { exact: true })
    .selectOption("right");
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.locator(".settings-view > [role=status]")).toContainText(
    "Alle Änderungen gespeichert",
  );
  const before = await stored(page);
  await dialog
    .getByRole("button", { name: "Arbeitsplatz zurücksetzen", exact: true })
    .click();
  await expect(dialog.getByLabel("Einsatzspalte", { exact: true })).toHaveValue(
    "left",
  );
  await dialog.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(dialog.getByLabel("Einsatzspalte", { exact: true })).toHaveValue(
    "right",
  );
  await dialog
    .getByRole("button", { name: "Standardwerte", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await expect(
    dialog.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("100");
  await expect(dialog.getByLabel("Kartensymbole", { exact: true })).toHaveValue(
    "100",
  );
  expect(await stored(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(
    dialog.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("120");
  await expect(dialog.getByLabel("Kartensymbole", { exact: true })).toHaveValue(
    "140",
  );
  await dialog.getByRole("tab", { name: "Audio", exact: true }).click();
  const panel = dialog.locator(".settings-content");
  await panel.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect
    .poll(() => panel.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
  await pinned(dialog);
  await page.screenshot({
    path: info.outputPath("settings-audio-dark-120-scrolled.png"),
  });
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});

test("Tastenkonflikte, Fokusfalle und Escape schützen Entwürfe; Dialogaktionen verändern weder Karte noch Spiel", async ({
  page,
}) => {
  const owner = await login(page, true),
    map = page.locator("[data-testid=germany-map-viewport]");
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/action"))
      actions.push(request.postData() ?? "");
  });
  const original = await map.getAttribute("data-camera");
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, -360);
  await expect.poll(() => map.getAttribute("data-camera")).not.toBe(original);
  await expect(map).toHaveAttribute("data-camera-moving", "false");
  const camera = await map.getAttribute("data-camera");
  await map.evaluate((element) => {
    (
      window as typeof window & { settingsMapClicks: number }
    ).settingsMapClicks = 0;
    element.addEventListener(
      "click",
      () =>
        (window as typeof window & { settingsMapClicks: number })
          .settingsMapClicks++,
    );
  });
  const initial = app.db.all().get(owner)!,
    objects = {
      money: initial.money,
      vehicles: initial.vehicles.length,
      buildings: initial.buildings.length,
    };
  const opener = page.getByRole("button", {
    name: "Einstellungen",
    exact: true,
  });
  const dialog = await settings(page);
  await dialog.getByRole("tab", { name: "Steuerung", exact: true }).click();
  const key = dialog.getByLabel("Taste: FMS", { exact: true });
  await key.fill("a");
  await expect(dialog.getByRole("alert")).toContainText(
    "Mehrfach belegte Tasten: A",
  );
  await expect(
    dialog.getByRole("button", { name: "Übernehmen", exact: true }),
  ).toBeDisabled();
  await key.fill("8");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const apply = dialog.getByRole("button", { name: "Übernehmen", exact: true }),
    close = dialog.getByRole("button", { name: "Schließen", exact: true });
  await apply.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(apply).toBeFocused();
  await page.keyboard.press("Escape");
  const guard = page.getByRole("alertdialog", {
    name: "Ungespeicherte Änderungen",
  });
  await expect(guard).toBeVisible();
  await expect(
    guard.getByRole("button", { name: "Weiter bearbeiten" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    guard.getByRole("button", { name: "Änderungen verwerfen" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(guard).toHaveCount(0);
  await expect(key).toHaveValue("8");
  await page.mouse.click(20, 400);
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Änderungen verwerfen" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(map).toHaveAttribute("data-camera", camera!);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { settingsMapClicks: number })
          .settingsMapClicks,
    ),
  ).toBe(0);
  const after = app.db.all().get(owner)!;
  expect({
    money: after.money,
    vehicles: after.vehicles.length,
    buildings: after.buildings.length,
  }).toEqual(objects);
  expect(actions).toEqual([]);
  expect((await stored(page)).device).toBeNull();
});

test("lokale Speicherfehler bewahren alte Audio- und Geräteeinstellungen; Entwürfe bleiben korrigierbar", async ({
  page,
}) => {
  await login(page);
  const dialog = await settings(page);
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.locator(".settings-view > [role=status]")).toContainText(
    "Alle Änderungen gespeichert",
  );
  const before = await stored(page);
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await dialog
    .getByLabel("Oberflächentext", { exact: true })
    .selectOption("120");
  await dialog.getByRole("tab", { name: "Audio", exact: true }).click();
  const master = dialog.getByRole("slider", {
    name: "Gesamtlautstärke",
    exact: true,
  });
  await master.fill("37");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    const state = window as typeof window & { settingsBlockedKey: string };
    state.settingsBlockedKey = "lv-audio-v1";
    Storage.prototype.setItem = function (key, value) {
      if (key === state.settingsBlockedKey)
        throw new DOMException(
          "Controlled browser quota failure",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.locator(".settings-view > .error")).toContainText(
    "Controlled browser quota failure",
  );
  expect(await stored(page)).toEqual(before);
  await expect(master).toHaveValue("37");
  await dialog.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await expect(
    dialog.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("120");
  await dialog.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(
    dialog.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("100");
  await dialog.getByLabel("Kartensymbole", { exact: true }).selectOption("140");
  await page.evaluate(
    () =>
      ((
        window as typeof window & { settingsBlockedKey: string }
      ).settingsBlockedKey = "lv-device-v2"),
  );
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Geräteeinstellungen konnten nicht gespeichert werden",
  );
  expect(await stored(page)).toEqual(before);
  await page.evaluate(
    () =>
      ((
        window as typeof window & { settingsBlockedKey: string }
      ).settingsBlockedKey = ""),
  );
  await dialog.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(dialog.locator(".settings-view > [role=status]")).toContainText(
    "Alle Änderungen gespeichert",
  );
  await page.reload();
  const again = await settings(page);
  await again.getByRole("tab", { name: "Anzeige & Karte" }).click();
  await expect(again.getByLabel("Kartensymbole", { exact: true })).toHaveValue(
    "140",
  );
  await expect(
    again.getByLabel("Oberflächentext", { exact: true }),
  ).toHaveValue("100");
});
