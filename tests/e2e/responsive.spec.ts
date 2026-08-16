import { expect, test } from "@playwright/test";

/** Mobile-first checks. Runs only under the `mobile` project (Pixel 5). */

test("navigation is reachable on a small screen", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator('nav[aria-label="Main"]');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Progress" })).toBeVisible();
});

test("the page does not scroll horizontally", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1); // allow sub-pixel rounding
});

test("touch targets meet the minimum comfortable size", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  const button = page.getByRole("button", { name: "Save settings" });
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
});
