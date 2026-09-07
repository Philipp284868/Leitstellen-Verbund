import { expect, type Page } from "@playwright/test";
export async function interviewUI(
  page: Page,
  app: { game: { step: (seconds: number) => void } },
) {
  await page
    .getByRole("button", { name: "Notruf annehmen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Wo genau ist der Notfall?", exact: true })
    .click();
  await expect(page.locator(".known-facts")).toContainText(
    /unbestätigt|bestätigt/,
  );
  app.game.step(5);
  await page
    .getByRole("button", { name: "Was ist passiert?", exact: true })
    .click();
  await expect(page.locator(".dispatch-list")).toBeVisible();
  await page
    .getByRole("button", { name: "Gespräch beenden", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Gespräch beenden", exact: true }),
  ).toHaveCount(0);
}
export async function joinDesk(owner: Page, member: Page, username: string) {
  await owner.getByRole("button", { name: "Freunde", exact: true }).click();
  await owner.getByLabel("Bestehenden Benutzernamen einladen").fill(username);
  await owner
    .getByRole("button", { name: "Disponenten einladen", exact: true })
    .click();
  await expect(
    owner.getByText(`Einladung versendet an ${username}`, { exact: false }),
  ).toBeVisible();
  await member.getByRole("button", { name: "Freunde", exact: true }).click();
  await member
    .getByRole("button", { name: "Einladung annehmen", exact: true })
    .click();
  await expect(
    member.getByRole("button", { name: "Leitstelle verlassen", exact: true }),
  ).toBeVisible();
  await owner.getByRole("button", { name: "Schließen", exact: true }).click();
  await member.getByRole("button", { name: "Schließen", exact: true }).click();
}
