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
  const modal = page.getByRole("dialog");
  if (await modal.isVisible()) {
    await modal.getByRole("button", { name: "Schließen", exact: true }).click();
    await expect(modal).toHaveCount(0);
  }
  const names: Record<string, string> = {
    AAO: "AAO",
    "AAO verwalten": "AAO",
    FMS: "FMS & Alarmierung",
    "FMS & Alarmierungsprofile": "FMS & Alarmierung",
    Freunde: "Kooperation & Disponenten",
    "Verbund & Leitstellenfunk": "Kooperation & Disponenten",
    Archiv: "Archiv & Statistik",
    Fahrzeuge: "Fuhrpark",
    Wachen: "Standorte verwalten",
    Standorte: "Standorte verwalten",
    "Katastrophenbereitschaft & KatS-Wachen": "Katastrophenbereitschaft",
    Gebäude: "Standorte verwalten",
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
  await page
    .getByRole("navigation", { name: "Leitstellenmenü", exact: true })
    .getByRole("button", { name: names[name] ?? name, exact: true })
    .click();
}
export async function showIncidents(page: Page) {
  if (
    await page
      .getByRole("complementary", { name: "Kartenwerkzeuge", exact: true })
      .isVisible()
  )
    await page.keyboard.press("Escape");
  const collapsed = page.getByRole("button", { name: /Einsätze.*Notrufe/ });
  if (await collapsed.isVisible()) await collapsed.click();
  await expect(page.getByRole("tab", { name: /Einsätze/ })).toBeVisible();
  await page.getByRole("tab", { name: /Einsätze/ }).click();
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
