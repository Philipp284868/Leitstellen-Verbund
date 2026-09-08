import type { Page } from "@playwright/test";
export async function openPanel(page: Page, name: string) {
  const target = page.getByRole("button", { name, exact: true });
  if (!(await target.isVisible()))
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
  await target.click();
}
export async function showIncidents(page: Page) {
  const button = page.getByRole("button", {
    name: "Einsatzliste ausklappen",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
}
