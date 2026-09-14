import { expect, type Page } from "@playwright/test";
export async function loginAndEnter(
  page: Page,
  username: string,
  password: string,
) {
  const login = page.getByLabel("Benutzername", { exact: true });
  const play = page.getByRole("button", { name: "Spielen", exact: true });
  // Session lookup and generation-bound cache cleanup finish asynchronously.
  await expect(login.or(play).first()).toBeVisible();
  if (await login.isVisible()) {
    await login.fill(username);
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  }
  await enterGame(page);
}
export async function enterGame(page: Page) {
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Leitstellenmenü", exact: true }),
  ).toBeVisible();
}
export async function openPanel(page: Page, name: string) {
  if (name === "Support")
    await expect(
      page
        .getByRole("button", { name: "Spielen", exact: true })
        .or(page.getByRole("button", { name: "Leitstellenmenü", exact: true })),
    ).toBeVisible();
  if (
    name === "Support" &&
    (await page
      .getByRole("button", { name: "Spielen", exact: true })
      .isVisible())
  )
    await enterGame(page);
  if (
    name === "Fortschritt" &&
    (await page.locator(".level-tile").isVisible())
  ) {
    await page.locator(".level-tile").click();
    return;
  }
  const modal = page.getByRole("dialog");
  if (await modal.isVisible()) {
    await modal.getByRole("button", { name: "Schließen", exact: true }).click();
    await expect(modal).toHaveCount(0);
  }
  const routes: Record<string, string[]> = {
    Support: ["Fehler melden"],
    AAO: ["AAO & Disposition"],
    "AAO verwalten": ["AAO & Disposition"],
    FMS: ["AAO & Disposition", "FMS & Alarmierung"],
    "FMS & Alarmierung": ["AAO & Disposition", "FMS & Alarmierung"],
    "FMS & Alarmierungsprofile": ["AAO & Disposition", "FMS & Alarmierung"],
    Notrufarbeitsplatz: ["AAO & Disposition", "Notrufarbeitsplatz"],
    Einsatzkatalog: ["AAO & Disposition", "Einsatzkatalog"],
    Freunde: ["Verbund"],
    "Verbund & Leitstellenfunk": ["Verbund"],
    "Kooperation & Disponenten": ["Verbund"],
    "Gemeinsame Einsatzlagen": ["Verbund", "Gemeinsame Einsatzlagen"],
    Katastrophenbereitschaft: ["Verbund", "Katastrophenbereitschaft"],
    "Katastrophenbereitschaft & KatS-Wachen": [
      "Verbund",
      "Katastrophenbereitschaft",
    ],
    Archiv: ["Einsatzarchiv"],
    "Archiv & Statistik": ["Einsatzarchiv"],
    Fahrzeuge: ["Fahrzeuge"],
    Fuhrpark: ["Fahrzeuge"],
    Wachen: ["Standorte"],
    "Standorte verwalten": ["Standorte"],
    Gebäude: ["Standorte"],
    "Standorte kaufen": ["Standorte", "Standort kaufen"],
    Fortschritt: ["Fortschritt"],
    Suche: ["Suchen …"],
    "Konto & Sicherheit": [
      "Einstellungen",
      "Hinweise & Hilfe",
      "Konto & Sicherheit",
    ],
    Sicherungen: ["Einstellungen", "Hinweise & Hilfe", "Sicherungen"],
  };
  const menu = page.getByRole("button", {
    name: "Leitstellenmenü",
    exact: true,
  });
  if (
    !(await menu.isVisible()) &&
    (await page.getByRole("button", { name, exact: true }).isVisible())
  ) {
    await page.getByRole("button", { name, exact: true }).click();
    return;
  }
  await expect(menu).toBeVisible();
  if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
  const route = routes[name] ?? [name];
  await page
    .getByRole("navigation", { name: "Leitstellenmenü", exact: true })
    .getByRole("button", { name: route[0], exact: true })
    .click();
  for (const child of route.slice(1))
    await page
      .getByRole("dialog")
      .getByRole(child === "Hinweise & Hilfe" ? "tab" : "button", {
        name: child,
        exact: true,
      })
      .click();
}
export async function showIncidents(page: Page) {
  if (
    await page
      .getByRole("complementary", { name: "Kartenwerkzeuge", exact: true })
      .isVisible()
  )
    await page.keyboard.press("Escape");
  const expand = page.getByRole("button", {
    name: "Einsatzliste ausklappen",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
}
export async function showMapTools(page: Page) {
  await openPanel(page, "Suche");
}

export async function toggleMapTools(page: Page) {
  const tools = page.getByRole("complementary", {
    name: "Kartenwerkzeuge",
    exact: true,
  });
  if (await tools.isVisible()) await page.keyboard.press("Escape");
  else await showMapTools(page);
}

export async function focusMapPoint(
  page: Page,
  point: { x: number; y: number },
  zoom = 17,
) {
  await expect(page.getByTestId("germany-map-viewport")).toHaveAttribute(
    "data-camera",
    /zoom/,
  );
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
          (await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"))!,
        ).zoom,
    )
    .toBeCloseTo(zoom, 1);
}
export async function mapKey(page: Page, key: string) {
  await page
    .getByLabel("Interaktive Karte von Deutschland", { exact: true })
    .focus();
  await page.keyboard.press(key);
}
