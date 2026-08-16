import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated WCAG 2.1 A/AA checks on every route, plus the keyboard and
 * landmark behaviour axe cannot assert on its own.
 */

const ROUTES = [
  { path: "/", name: "Home" },
  { path: "/plan", name: "Plan" },
  { path: "/today", name: "Today" },
  { path: "/learn", name: "Learn" },
  { path: "/map", name: "Mind map" },
  { path: "/difficulties", name: "Difficulties" },
  { path: "/progress", name: "Progress" },
  { path: "/report", name: "Reports" },
  { path: "/settings", name: "Settings" },
] as const;

for (const route of ROUTES) {
  test(`${route.name} has no detectable WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Report the offending selector, not just the rule — a bare rule id is
    // almost useless when a page has fifty elements.
    expect(
      results.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`),
      ),
    ).toEqual([]);
  });
}

test("every page exposes a main landmark and a level-1 heading", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("skip link is the first tab stop and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("navigation marks the current page for assistive technology", async ({ page }) => {
  await page.goto("/progress");
  await page.waitForLoadState("networkidle");
  const current = page.locator('nav[aria-label="Main"] [aria-current="page"]');
  await expect(current).toHaveText("Progress");
});

test("async status regions are announced, not just shown", async ({ page }) => {
  await page.goto("/difficulties");
  await expect(page.locator("[aria-live='polite']").first()).toBeAttached();
});

test("tag picker pills expose their pressed state", async ({ page }) => {
  await page.goto("/plan");
  await page.waitForLoadState("networkidle");
  // Colour alone must not carry which tags are selected.
  const tag = page.getByRole("button", { name: "Exam prep", exact: true });
  await expect(tag).toHaveAttribute("aria-pressed", "false");
  await tag.click();
  await expect(tag).toHaveAttribute("aria-pressed", "true");
});

test("the learning layer tabs are real tabs", async ({ page }) => {
  await page.goto("/learn");
  await page.waitForLoadState("networkidle");
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  expect(await tabs.count()).toBeGreaterThanOrEqual(3);
});
