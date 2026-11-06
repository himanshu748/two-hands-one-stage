import { test, expect, type Page } from "@playwright/test";
import { BriefSchema, validateScene } from "@two-hands/domain";
import { syntheticRevision } from "../../fixtures/scene.js";

/** Synthetic API fixtures only; these tests do not send a Mattermost message. */
function emptyState() {
  return { connection: { status: "disconnected", detail: "Synthetic test; live Switch unavailable." }, brief: null, current: null, currentDigest: null, constraints: [], observations: [], proposals: [], rehearsals: [], artifacts: [], jobs: [], synthetic: true };
}
async function openEmpty(page: Page) {
  await page.route("**/api/state", (route) => route.fulfill({ json: emptyState() }));
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("form", { name: "Scene brief" })).toBeVisible();
}
async function fillBrief(page: Page) {
  await page.getByLabel("Scene title", { exact: true }).fill("A synthetic test story");
  await page.getByLabel("Prop 1", { exact: true }).fill("Paper");
  await page.getByLabel("Prop 2", { exact: true }).fill("Cup");
  await page.getByLabel("Prop 3", { exact: true }).fill("Key");
  await page.getByLabel("Emotional goal", { exact: true }).fill("Move from uncertainty to welcome.");
  await page.getByLabel("Protected story fact", { exact: true }).fill("The key belongs to the visitor.");
}
const prepare = (page: Page) => page.getByRole("button", { name: "Prepare Mattermost message" }).click();
const message = (page: Page) => page.getByLabel("Your Mattermost message", { exact: true });
function parseCommand(command: string) {
  expect(command).toMatch(/^@two-hands-writer brief /);
  return BriefSchema.parse(JSON.parse(command.replace(/^@two-hands-writer brief /, "")));
}

test("brief composer validates required fields and distinct prop names", async ({ page }) => {
  await openEmpty(page);
  await expect(page.getByLabel("Scene title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Emotional goal", { exact: true })).toHaveValue("");
  await prepare(page);
  await expect(page.getByRole("alert")).toContainText("Check the marked fields");
  await expect(message(page)).toHaveCount(0);
  await fillBrief(page);
  await page.getByLabel("Prop 2", { exact: true }).fill("paper");
  await prepare(page);
  await expect(page.getByText("Give the three props distinct names")).toBeVisible();
  await expect(message(page)).toHaveCount(0);
});

test("brief message copies exact Unicode and escaped strings without mutation; scene ID remains stable", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mutations: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  await openEmpty(page);
  await fillBrief(page);
  const name = 'चाबी 🔑 "return"';
  const fact = '</textarea><script>window.briefInjected=true</script>\nA "quoted" fact \\ stays true.';
  await page.getByLabel("Prop 3", { exact: true }).fill(name);
  await page.getByLabel("Protected story fact", { exact: true }).fill(fact);
  await prepare(page);
  const command = await message(page).inputValue();
  await page.screenshot({ path: testInfo.outputPath("brief-desktop.png"), fullPage: true });
  const brief = parseCommand(command);
  expect(brief.props[2]?.name).toBe(name);
  expect(brief.protectedFact).toBe(fact);
  await expect(message(page)).toHaveAttribute("readonly", "");
  expect(await page.evaluate(() => Reflect.get(window, "briefInjected") as unknown)).toBeUndefined();
  await page.getByRole("button", { name: "Copy brief message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied." })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await page.getByLabel("Scene title", { exact: true }).fill("Revised local title");
  await expect(message(page)).toHaveCount(0);
  await prepare(page);
  expect(parseCommand(await message(page).inputValue()).sceneId).toBe(brief.sceneId);
  expect(mutations).toEqual([]);
});

test("draft recovery copies only an eligible human instruction and exposes exhausted retries", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mutations: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  const base = syntheticRevision;
  const brief = { sceneId: base.sceneId, title: base.title, props: base.props, emotionalGoal: base.emotionalGoal, protectedFact: base.protectedFact };
  let retryDraft = { eligible: true, remaining: 2, reason: "The writer could not complete the initial draft." };
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...emptyState(), brief, retryDraft } }));
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("heading", { name: "Ask for another draft" })).toBeVisible();
  await expect(page.getByLabel("Send in Mattermost", { exact: true })).toHaveValue("@two-hands-writer retry-draft");
  await page.getByRole("button", { name: "Copy retry instruction" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("@two-hands-writer retry-draft");
  expect(mutations).toEqual([]);
  retryDraft = { eligible: false, remaining: 0, reason: "Both authorized retries have been used." };
  await page.reload();
  await expect(page.getByText("Both authorized retries have been used.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy retry instruction" })).toHaveCount(0);
  await expect(page.getByText("0 retries remaining. Your original brief stays the same.")).toBeVisible();
});

test("mobile keyboard composer remains readable and never replaces a received brief", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openEmpty(page);
  await page.getByLabel("Scene title", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Prop 1", { exact: true })).toBeFocused();
  await fillBrief(page);
  await prepare(page);
  await expect(page.getByText("READY TO COPY · NOT SENT")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("brief-mobile.png"), fullPage: true });
  const base = syntheticRevision;
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...emptyState(), brief: { sceneId: base.sceneId, title: base.title, props: base.props, emotionalGoal: base.emotionalGoal, protectedFact: base.protectedFact } } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your first scene is taking shape." })).toBeVisible();
  await expect(page.getByRole("form", { name: "Scene brief" })).toHaveCount(0);
});

test("new confirmed constraints keep old success historical while the current scene awaits repair", async ({ page }) => {
  const base = structuredClone(syntheticRevision);
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...emptyState(), current: base, currentDigest: "a".repeat(64), needsRepair: true, approvalHold: false, constraints: [{ id: "synthetic-constraint", observationId: "synthetic-observation", description: "Left hand must remain free.", unavailableHand: "left" }], rehearsals: [{ id: "synthetic-historical-outcome", revisionId: base.id, outcome: "success", text: "Synthetic historical success record, before the new constraint.", source: "human" }] } }));
  await page.goto("/studio?view=stage");
  await expect(page.getByText("○ Awaiting repair", { exact: true })).toBeVisible();
  await expect(page.getByText("✓ Human rehearsed", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Record", exact: true }).click();
  await expect(page.getByText("Synthetic historical success record, before the new constraint.")).toBeVisible();
});

test("a recovered first draft defaults to the latest eligible candidate and preserves explicit comparison", async ({ page }) => {
  const base = structuredClone(syntheticRevision);
  const latest = { ...structuredClone(base), id: "synthetic-retry-r2", title: "A recovered synthetic draft" };
  const proposal = (candidate: typeof base, status: "rejected" | "eligible") => ({ id: `proposal-${candidate.id}`, baseRevisionId: null, candidate, digest: "b".repeat(64), patch: null, affectedBeats: ["b1", "b2", "b3", "b4", "b5", "b6"], dependentTransitions: [], artisticCosts: ["Synthetic narrative comparison."], validation: validateScene(candidate), diff: [], status, review: "Synthetic review." });
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...emptyState(), proposals: [proposal(base, "rejected"), proposal(latest, "eligible")] } }));
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("heading", { name: latest.title, level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: /Repairs/ }).click();
  await page.getByRole("group", { name: "Repair alternatives" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Preview this candidate" }).click();
  await expect(page.getByRole("heading", { name: base.title, level: 1 })).toBeVisible();
});

test("withdrawn rehearsal remains historical without restoring an earlier success label", async ({ page }) => {
  const base = structuredClone(syntheticRevision);
  await page.route("**/api/state", (route) => route.fulfill({ json: { ...emptyState(), current: base, currentDigest: "a".repeat(64), needsRepair: false, approvalHold: false, rehearsals: [
    { id: "synthetic-earlier-success", revisionId: base.id, outcome: "success", text: "Synthetic earlier success record.", source: "human", withdrawn: false },
    { id: "synthetic-withdrawn-outcome", revisionId: base.id, outcome: "success", text: "Synthetic original rehearsal words preserved after withdrawal.", source: "human", withdrawn: true },
  ] } }));
  await page.goto("/studio?view=stage");
  await expect(page.getByText("✓ Human rehearsed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("○ Awaiting rehearsal", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Record", exact: true }).click();
  const history = page.getByRole("region", { name: "Rehearsal history" });
  await expect(history.getByText("Synthetic original rehearsal words preserved after withdrawal.")).toBeVisible();
  await expect(history.getByText("Withdrawn", { exact: true })).toBeVisible();
  await expect(history.getByText("Synthetic earlier success record.")).toBeVisible();
});
