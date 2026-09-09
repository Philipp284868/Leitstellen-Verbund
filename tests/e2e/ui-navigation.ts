import { expect, type Page } from "@playwright/test";
export async function openPanel(page: Page, name: string) {
  const modal = page.getByRole("dialog");
  if (await modal.isVisible()) {
    await modal.getByRole("button", { name: "Schließen", exact: true }).click();
    // Never discard data on behalf of a test. A still-dirty form must be handled
    // explicitly by the test that created its draft.
    await expect(modal).toHaveCount(0);
  }
  const radio: Record<string, string> = {
    AAO: "AAO verwalten",
    FMS: "FMS & Alarmierungsprofile",
    Freunde: "Verbund & Leitstellenfunk",
  };
  if (name in radio) {
    await page.getByRole("button", { name: "Funk", exact: true }).click();
    await page
      .getByRole("button", {
        name: new RegExp(
          `^${radio[name].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\d+)?$`,
        ),
      })
      .click();
    return;
  }
  if (name === "Archiv") await showIncidents(page);
  if (name === "Sicherungen") {
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Hinweise & Hilfe", exact: true })
      .click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}
export async function showIncidents(page: Page) {
  const button = page.getByRole("button", {
    name: /^Einsatzliste (aus|ein)klappen$/,
  });
  await expect(button).toBeVisible();
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
export async function showMapTools(page: Page) {
  const button = page.getByRole("button", { name: "Karte", exact: true });
  await expect(button).toBeVisible();
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
