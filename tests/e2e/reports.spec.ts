import { test, expect, type Page } from "@playwright/test";
import { syntheticRevision } from "../../fixtures/scene.js";

/** Synthetic browser inputs; clicking the confirmation here is not real rehearsal evidence. */
function fixture() {
  return {
    connection: { status: "disconnected", detail: "Synthetic test; no live Switch." },
    brief: null, current: structuredClone(syntheticRevision), currentDigest: "a".repeat(64),
    constraints: [], observations: [], proposals: [], rehearsals: [], artifacts: [], jobs: [],
    approvals: [{ proposalId: "synthetic-proposal", revisionId: syntheticRevision.id, digest: "a".repeat(64), revoked: false }],
    approvalHold: false, needsRepair: false, synthetic: true,
  };
}
async function record(page: Page) {
  await page.goto("/studio?view=stage");
  await page.getByRole("tab", { name: "Record", exact: true }).click();
  await expect(page.getByRole("form", { name: "Rehearsal report" })).toBeVisible();
}
const reportText = (page: Page) => page.getByLabel("What actually happened?", { exact: true });
const prepare = (page: Page) => page.getByRole("button", { name: "Prepare rehearsal message" }).click();
const message = (page: Page) => page.getByLabel("Your rehearsal message for Mattermost", { exact: true });
const confirm = (page: Page) => page.getByRole("checkbox", { name: /I performed revision/ }).check();

test("rehearsal message preserves original words and copies without creating evidence", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mutations: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture() }));
  await record(page);
  await prepare(page);
  await expect(page.getByRole("alert")).toContainText("Confirm that you performed");
  const original = 'Synthetic test words: चाबी 🔑 at beat 3.\nThe "cup" was hard to reach. <script>no execution</script>';
  await reportText(page).fill(original);
  await prepare(page);
  await expect(message(page)).toHaveCount(0);
  await confirm(page);
  await prepare(page);
  const command = `@two-hands-stage observe ${syntheticRevision.id} ${original}`;
  await expect(message(page)).toHaveValue(command);
  await page.getByRole("button", { name: "Copy rehearsal message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied, not sent" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await expect(page.getByText("No physical rehearsal recorded. Model checked does not mean performed.")).toBeVisible();
  await reportText(page).fill("Changed synthetic report.");
  await expect(message(page)).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("outcomes stay distinct from repair requests and success respects a repair hold", async ({ page }) => {
  const state = fixture();
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await record(page);
  await expect(page.getByText(/Switch is disconnected. You can prepare/)).toBeVisible();
  await page.getByLabel("What would you like to share?").selectOption("success");
  await reportText(page).fill("Synthetic test: the approved scene was comfortable.");
  await confirm(page);
  await prepare(page);
  await expect(message(page)).toHaveValue(`@two-hands-stage outcome ${syntheticRevision.id} success Synthetic test: the approved scene was comfortable.`);
  state.needsRepair = true;
  await expect(message(page)).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Record a successful rehearsal" })).toBeDisabled();
  await page.getByLabel("What would you like to share?").selectOption("difficulty");
  await expect(page.getByText(/This records the outcome only/)).toBeVisible();
  await reportText(page).fill("Synthetic test: a difficulty remains.");
  await confirm(page);
  await prepare(page);
  await expect(message(page)).toHaveValue(`@two-hands-stage outcome ${syntheticRevision.id} difficulty Synthetic test: a difficulty remains.`);
});

test("new revisions, revoked approval and a stale API remove prepared messages", async ({ page }) => {
  const state = fixture();
  let failed = false;
  await page.route("**/api/state", (route) => failed ? route.fulfill({ status: 503, body: "Synthetic outage" }) : route.fulfill({ json: state }));
  await record(page);
  await reportText(page).fill("Synthetic test for the original revision.");
  await confirm(page);
  await prepare(page);
  state.current.id = "synthetic-new-approved-revision";
  state.approvals[0]!.revisionId = state.current.id;
  state.currentDigest = "b".repeat(64);
  await expect(message(page)).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /synthetic-new-approved-revision/ })).not.toBeChecked();
  await reportText(page).fill("Synthetic test for the new revision.");
  await confirm(page);
  await prepare(page);
  await expect(message(page)).toHaveValue(/synthetic-new-approved-revision/);
  state.approvals[0]!.revoked = true;
  await expect(page.getByRole("form", { name: "Rehearsal report" })).toHaveCount(0);
  await expect(message(page)).toHaveCount(0);
  state.approvals[0]!.revoked = false;
  await expect(page.getByRole("form", { name: "Rehearsal report" })).toBeVisible();
  await reportText(page).fill("Synthetic text before a network interruption.");
  await confirm(page);
  await prepare(page);
  failed = true;
  await expect(message(page)).toHaveCount(0);
  await expect(page.getByText(/Reconnect to the application service before preparing/)).toBeVisible();
});

test("clipboard failure selects the exact command for manual copying", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Synthetic clipboard denial")) } }); });
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture() }));
  await record(page);
  await reportText(page).fill("Synthetic test difficulty at beat 2.");
  await confirm(page);
  await prepare(page);
  await page.getByRole("button", { name: "Copy rehearsal message" }).click();
  await expect(message(page)).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: /Clipboard unavailable/ })).toBeVisible();
  expect(await message(page).evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe(await message(page).inputValue());
});

test("Escape pauses focused cue controls and opens a keyboard-accessible report", async ({ page }) => {
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture() }));
  await page.goto("/studio?view=stage");
  await page.getByRole("button", { name: "Start timed cues", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Paused — reset props before restarting", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Describe rehearsal" }).click();
  await expect(page.getByRole("heading", { name: "How did it feel to perform?" })).toBeFocused();
  await expect(page.getByRole("checkbox", { name: /I performed revision/ })).not.toBeChecked();
  await expect(message(page)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Describe rehearsal" })).toBeVisible();
  await page.getByRole("button", { name: "Describe rehearsal" }).click();
  await expect(page.getByRole("heading", { name: "How did it feel to perform?" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a pending clipboard request cannot mark an edited report as copied", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => new Promise<void>((resolve) => {
      window.addEventListener("resolve-test-clipboard", () => resolve(), { once: true });
    }) } });
  });
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture() }));
  await record(page);
  await reportText(page).fill("Synthetic original draft.");
  await confirm(page);
  await prepare(page);
  await page.getByRole("button", { name: "Copy rehearsal message" }).click();
  await expect(page.getByRole("button", { name: "Copying message…" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for clipboard access…" })).toBeVisible();
  await reportText(page).fill("Synthetic edited draft.");
  await prepare(page);
  await page.evaluate(() => window.dispatchEvent(new Event("resolve-test-clipboard")));
  await expect(page.getByRole("button", { name: "Copy rehearsal message" })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Review the message" })).toBeVisible();
  await expect(message(page)).toHaveValue(/Synthetic edited draft\.$/);
});

test("report is readable on mobile with keyboard and reduced motion", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture() }));
  await record(page);
  await page.getByLabel("What would you like to share?").focus();
  await page.keyboard.press("Tab");
  await expect(reportText(page)).toBeFocused();
  await reportText(page).fill("Synthetic test: difficulty lifting the cup during beat 2.");
  await confirm(page);
  await prepare(page);
  await expect(message(page)).toBeVisible();
  expect(await page.locator(".report-message").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("rehearsal-report-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await message(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("rehearsal-report-desktop.png"), fullPage: true });
});
