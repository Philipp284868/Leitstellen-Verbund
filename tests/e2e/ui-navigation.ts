import { expect, type Page } from "@playwright/test";
export async function openPanel(page: Page, name: string) {
  if (name === "Archiv") await showIncidents(page);
  const target = page.getByRole("button", { name, exact: true });
  if (!(await target.isVisible()))
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
  await target.click();
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
