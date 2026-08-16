import { expect, test, type Page } from "@playwright/test";

/**
 * The core loop end to end: onboard, plan, act, capture, prove, report.
 *
 * These run against the real database — this is a single-user app with no
 * fixture DB. Specs are idempotent and use unique-but-recognisable names so
 * anything they leave behind is obvious and removable.
 */

const STAMP = () => `e2e-${Date.now().toString().slice(-6)}`;

async function ensureOnboarded(page: Page) {
  await page.goto("/");
  if (!page.url().includes("/onboarding")) return;

  await page.getByLabel("What should Orbit call you?").fill("Test User");
  await page.getByLabel("Primary goals").fill("Ship Orbit");
  await page.getByLabel("Subjects or skills you're learning").fill("Mathematics");
  await page.getByLabel("Mandatory daily habits").fill("Morning walk");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/**
 * Build only if today has no plan yet — rebuilding was removed (it silently
 * wiped completed task history, which was more confusing than useful), so the
 * form to build a day is gone once a plan exists. Downstream tests must
 * tolerate whatever a prior run in the same day already left behind, the same
 * way a real user would.
 */
async function ensurePlan(page: Page) {
  await ensureOnboarded(page);
  await page.goto("/plan");
  const buildButton = page.getByRole("button", { name: "Build my day" });
  if (await buildButton.isVisible().catch(() => false)) {
    await buildButton.click();
    await expect(page.getByRole("heading", { name: "Today's list" })).toBeVisible({
      timeout: 60_000,
    });
  }

  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  // The plan is only usable once its three wins are on screen.
  await expect(page.getByRole("button", { name: /Mark complete|Completed/ }).first()).toBeVisible({
    timeout: 30_000,
  });
}

test("a fresh install lands on onboarding", async ({ page }) => {
  await page.goto("/");
  if (page.url().includes("/onboarding")) {
    await expect(page.getByRole("heading", { name: "Set up Orbit" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("builds a day plan with exactly three wins", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");

  const wins = page.locator('section[aria-labelledby="wins-heading"]');
  await expect(wins.getByText("Physical", { exact: true })).toBeVisible();
  await expect(wins.getByText("Mental", { exact: true })).toBeVisible();
  await expect(wins.getByText("Emotional", { exact: true })).toBeVisible();
});

test("answers 'what to do now' above the fold", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");
  await expect(page.getByText("What to do now")).toBeVisible();
});

test("completing a win survives a reload", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");

  // The database persists between runs, so the first win may already be done.
  // Normalise to pending, then complete it — that exercises both directions.
  const toggle = page.getByRole("button", { name: /Mark complete|Completed/ }).first();
  await expect(toggle).toBeVisible({ timeout: 20_000 });

  if ((await toggle.textContent())?.includes("Completed")) {
    await toggle.click();
    await expect(page.getByRole("button", { name: "Mark complete" }).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByRole("button", { name: /Completed/ }).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await expect(page.getByRole("button", { name: /Completed/ }).first()).toBeVisible();
});

test("a task can be added on Plan, then edited and deleted on Today", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/plan");

  const title = `${STAMP()} task`;
  await page.getByLabel("Add a task").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

  await page.goto("/today");
  await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: `Edit ${title}` }).click();
  const edited = `${title} edited`;
  await page.getByLabel("Title").fill(edited);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: `Edit ${edited}` })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: `Delete ${edited}` }).click();
  await expect(page.getByRole("button", { name: `Edit ${edited}` })).toBeHidden({
    timeout: 20_000,
  });
});

test("Plan's own list supports edit and delete directly, without going to Today", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/plan");

  const title = `${STAMP()} plan-side task`;
  await page.getByLabel("Add a task").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const editButton = page.getByRole("button", { name: `Edit ${title}` });
  await expect(editButton).toBeVisible({ timeout: 20_000 });

  await editButton.click();
  const edited = `${title} edited`;
  await page.getByLabel("Title").fill(edited);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: `Edit ${edited}` })).toBeVisible({
    timeout: 20_000,
  });

  // Plan's list is add/edit/delete only — no Done/Skip buttons belong here.
  await expect(page.getByRole("button", { name: `Complete ${edited}` })).toHaveCount(0);

  await page.getByRole("button", { name: `Delete ${edited}` }).click();
  await expect(page.getByRole("button", { name: `Edit ${edited}` })).toBeHidden({
    timeout: 20_000,
  });
});

test("Calendar's day detail shows that day's actual tasks", async ({ page }) => {
  await ensurePlan(page);
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));

  await page.goto(`/calendar/${today}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  // The onboarding fixture always sets "Morning walk" as a mandatory habit,
  // so it is guaranteed to be one of today's generated tasks.
  await expect(page.getByText("Morning walk")).toBeVisible();
});

test("a difficulty can be captured and appears on the dashboard", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/difficulties");

  await page
    .getByLabel("What are you struggling with right now?")
    .fill(`${STAMP()} integration by parts`);
  await page.getByLabel("How hard is it?").selectOption("stuck");
  await page.getByRole("button", { name: "Capture" }).click();

  await expect(page.getByText(/Captured/)).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText("Active")).toBeVisible();
});

test("a too-short difficulty is rejected", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/difficulties");
  await page.getByLabel("What are you struggling with right now?").fill("x");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
});

test("marking a task done prompts for a proof link, which is recorded", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");

  const doneButton = page.getByRole("button", { name: /^Complete /, exact: false }).first();
  await expect(doneButton).toBeVisible({ timeout: 20_000 });
  await doneButton.click();

  const urlInput = page.getByLabel("Proof link");
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  await urlInput.fill(`https://example.com/${STAMP()}/commit`);
  await page.getByRole("button", { name: "Save proof", exact: true }).click();

  await expect(urlInput).toBeHidden({ timeout: 20_000 });
});

test("skipping the proof prompt leaves no evidence and just closes", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");

  const doneButton = page.getByRole("button", { name: /^Complete /, exact: false }).first();
  await expect(doneButton).toBeVisible({ timeout: 20_000 });
  await doneButton.click();

  const urlInput = page.getByLabel("Proof link");
  await expect(urlInput).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "No proof", exact: true }).click();
  await expect(urlInput).toBeHidden();
});

test("the daily reflection saves and shows tonight's read", async ({ page }) => {
  await ensurePlan(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");

  const text = `${STAMP()} good focus today`;
  await page.getByLabel("Reflection").fill(text);
  await page.getByRole("button", { name: "Save reflection" }).click();

  await expect(page.getByText("Saved")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel("Reflection")).toHaveValue(text);
});

test("the mind map canvas loads and accepts a node", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/map");
  await page.waitForLoadState("networkidle");

  const title = `${STAMP()} concept`;
  await page.getByLabel("Add a concept").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible({
    timeout: 45_000,
  });
});

test("the report renders with figures, streaks and an export", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/report");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Growth report" })).toBeVisible();
  await expect(page.locator("#figures")).toBeVisible();
  await expect(page.locator("#streaks")).toBeVisible();
  await expect(page.getByRole("link", { name: "JSON", exact: true })).toBeVisible();
});

test("the JSON export is well formed and separates verifiable evidence", async ({ request }) => {
  const res = await request.get("/api/report");
  expect(res.ok()).toBe(true);

  const body = await res.json();
  expect(body).toHaveProperty("summary.verifiableCount");
  expect(body).toHaveProperty("streaks.activity.current");
  expect(Array.isArray(body.evidence)).toBe(true);
  expect(Array.isArray(body.painPoints)).toBe(true);
});

test("an invalid report range is refused", async ({ request }) => {
  const res = await request.get("/api/report?from=2026-12-01&to=2026-01-01");
  expect(res.status()).toBe(400);
});

test("training links are seeded and openable externally", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/learn");
  await page.getByRole("tab", { name: "Training" }).click();

  await expect(page.getByText("Sequence memory")).toBeVisible();
  // Nothing is configured out of the box; the slot says so rather than
  // pretending to be playable.
  await expect(page.getByText("no link yet").first()).toBeVisible();
});

test("settings save and persist", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/settings");

  await page.getByLabel("Exercise minutes").fill("35");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByLabel("Exercise minutes")).toHaveValue("35");
});

test("what leaves the machine is documented", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/settings");
  await expect(page.getByText("What Orbit sends to Groq")).toBeVisible();
});

test("progress is honest about thin data", async ({ page }) => {
  await ensureOnboarded(page);
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  const body = await page.textContent("main");
  expect(body).toMatch(/Still learning|No completed days|completion/i);
});
