import { test, expect, type Page } from "@playwright/test";
import { syntheticRevision } from "../../fixtures/scene.js";
import {
  applyPatch,
  diffRevisions,
  validateScene,
  type Constraint,
  type Patch,
} from "@two-hands/domain";

/** All browser inputs here are synthetic fixtures. No live Switch or physical rehearsal is implied. */
function fixtureState() {
  const base = structuredClone(syntheticRevision);
  const constraint: Constraint = {
    id: "synthetic-constraint",
    observationId: "synthetic-observation",
    description:
      "Keep the left hand free throughout this synthetic rehearsal scenario.",
    unavailableHand: "left",
  };
  const first = base.beats[0];
  const third = base.beats[2];
  if (!first || !third)
    throw new Error("Synthetic fixture must contain six beats.");
  const patch: Patch = {
    beats: [
      {
        ...first,
        actions: [
          {
            type: "move",
            propId: "p1",
            hand: "right",
            from: "table",
            to: "rest",
          },
        ],
      },
      {
        ...third,
        actions: [{ type: "pause", seconds: 2 }],
        dialogue: "I left a little room beside the light.",
      },
    ],
  };
  const candidate = applyPatch(base, patch, "synthetic-r2", [constraint]);
  return {
    connection: {
      status: "disconnected",
      detail: "Synthetic browser test. Live Switch is not configured.",
    },
    brief: {
      sceneId: base.sceneId,
      title: base.title,
      props: base.props,
      emotionalGoal: base.emotionalGoal,
      protectedFact: base.protectedFact,
    },
    current: base,
    currentDigest: "a".repeat(64),
    constraints: [constraint],
    observations: [
      {
        id: "synthetic-observation",
        revisionId: base.id,
        text: "My left hand needs to stay free.",
        interpretation: "Keep the left hand free throughout the scene.",
        status: "confirmed",
      },
    ],
    proposals: [
      {
        id: "synthetic-proposal",
        baseRevisionId: base.id,
        candidate,
        digest: "b".repeat(64),
        patch,
        affectedBeats: ["b1", "b3"],
        dependentTransitions: ["b2", "b3", "b4", "b5", "b6"],
        artisticCosts: [
          "The boat waits on the table instead of being cradled. The welcome becomes more spacious and less protective.",
        ],
        validation: validateScene(candidate),
        diff: diffRevisions(base, candidate),
        status: "eligible",
        review:
          "All six beats checked. The right hand is free before moving the cup.",
      },
    ],
    rehearsals: [
      {
        id: "synthetic-attempt",
        revisionId: base.id,
        outcome: "difficulty",
        text: "Synthetic observation for automated tests; no person has rehearsed this scene.",
        source: "synthetic",
      },
    ],
    artifacts: [
      {
        revisionId: base.id,
        digest: "a".repeat(64),
        cueUrl: "/artifacts/synthetic-r1/cue.html",
        scriptUrl: "/artifacts/synthetic-r1/script.html",
      },
    ],
    jobs: [],
    synthetic: true,
  };
}

async function openFixture(page: Page) {
  await page.route("**/api/state", async (route) => {
    await route.fulfill({ json: fixtureState() });
  });
  await page.goto("/studio?view=stage");
  await expect(
    page.getByRole("heading", { name: "A light left on", level: 1 }),
  ).toBeVisible();
}

test("storyboard, director, physical state, and artifact workspace keep evidence distinct", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openFixture(page);
  await expect(
    page.getByText("Synthetic test scene", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Scene beats" }).getByRole("button"),
  ).toHaveCount(6);
  await expect(
    page.getByText("ONE BLOCKING CONFLICT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ORIGINAL PERFORMER OBSERVATION", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("STAGE ENGINEER INTERPRETATION", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("○ Awaiting rehearsal", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("✓ Human rehearsed", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("workbench-desktop.png"),
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
  await page
    .getByRole("navigation", { name: "Scene beats" })
    .getByRole("button")
    .nth(1)
    .click();
  await expect(
    page.getByRole("heading", { name: "A small lighthouse", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await page
    .locator(".prop-inspect-strip")
    .getByRole("button", { name: /Blue cup/ })
    .click();
  await expect(page.locator(".position-list")).toContainText("Resting place");
  await page.getByRole("tab", { name: "Take away", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Offline cue player", exact: false }),
  ).toHaveAttribute("href", "/artifacts/synthetic-r1/cue.html");
});

test("repair workspace exposes a localized diff and only a Mattermost approval command", async ({
  page, context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET")
      mutations.push(request.method());
  });
  await openFixture(page);
  await page.getByRole("tab", { name: /Repairs/ }).click();
  await expect(
    page.getByRole("region", { name: "Before b1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "After b3", exact: true }),
  ).toBeVisible();
  const exactCommand = `@two-hands-stage approve synthetic-proposal synthetic-r2 ${"b".repeat(64)}`;
  await expect(page.locator(".copy-command")).not.toBeVisible();
  await page.getByText("Show the exact message", { exact: true }).click();
  await expect(page.locator(".copy-command")).toHaveText(exactCommand);
  await page.getByRole("button", { name: "Copy approval command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exactCommand);
  await expect(
    page.getByText("Copying this command does not approve anything.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview this candidate", exact: true })
    .click();
  await expect(
    page.getByText("Candidate preview", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Compare revision" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Take away", exact: true }).click();
  await expect(
    page.getByText("Available after exact approval", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Approve$/ })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("action stepping moves only valid props and compare returns to the exact original", async ({
  page,
}) => {
  await openFixture(page);
  await expect(
    page.getByRole("button", {
      name: "Inspect Paper boat, on the table",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect Paper boat, on the table",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".current-action")).toContainText(
    "No state change was applied.",
  );
  await page.getByRole("tab", { name: /Repairs/ }).click();
  await page
    .getByRole("button", { name: "Preview this candidate", exact: true })
    .click();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect Paper boat, on the resting place",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".beat-tile-meta").getByText("Changed", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("group", { name: "Compare revision" })
    .getByRole("button", { name: "Original", exact: true })
    .click();
  await expect(page.getByText("Approved scene", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Inspect Paper boat, on the table",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Compare revision" })
    .getByRole("button", { name: /Candidate/ })
    .click();
  await expect(
    page.getByText("Candidate preview", { exact: true }),
  ).toBeVisible();
});

test("prop inspection and previous-action controls expose exact symbolic locations", async ({
  page,
}) => {
  await openFixture(page);
  await page
    .getByRole("navigation", { name: "Scene beats" })
    .getByRole("button")
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  const cup = page.getByRole("button", {
    name: "Inspect Blue cup, on the resting place",
    exact: true,
  });
  await expect(cup).toHaveAttribute("aria-pressed", "true");
  await cup.click();
  await expect(cup).toHaveAttribute("aria-pressed", "false");
  await cup.click();
  await expect(page.locator(".stage-selection-caption")).toContainText(
    "Blue cup",
  );
  await expect(page.locator(".stage-selection-caption")).toContainText(
    "on the resting place",
  );
  await page
    .getByRole("button", { name: "Previous action", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Inspect Blue cup, on the table",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next beat", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room to wait", exact: true }),
  ).toBeVisible();
});

test("timed cues provide a hands-free lead-in and explicit pause/reset", async ({
  page,
}) => {
  await openFixture(page);
  await page.clock.install();
  await page
    .getByRole("button", { name: "Start timed cues", exact: true })
    .click();
  await expect(
    page.getByText("Hands ready in 5…", { exact: true }),
  ).toBeVisible();
  await page.clock.runFor(5000);
  await expect(
    page.getByText("Beat 1 · 12s remaining", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause cues", exact: true }).click();
  await expect(
    page.getByText("Paused — reset props before restarting", { exact: true }),
  ).toBeVisible();
  await page.clock.runFor(20000);
  await expect(
    page.getByRole("heading", { name: "The empty shore", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByText("Five-second lead-in", { exact: true }),
  ).toBeVisible();
});

test("keyboard access and reduced motion preserve studio interactions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to the scene" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "A small lighthouse", exact: true }),
  ).toBeVisible();
  const cueButton = page.getByRole("button", {
    name: "Start timed cues",
    exact: true,
  });
  await cueButton.focus();
  const appearance = await cueButton.evaluate((element) => ({
    outline: getComputedStyle(element).outlineStyle,
    transition: getComputedStyle(element).transitionDuration,
  }));
  expect(appearance.outline).not.toBe("none");
  expect(appearance.transition).toBe("0s");
  await expect(page.locator(".stage-token-position--p1")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("tab", { name: "Stage", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Repairs/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Record", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("mobile studio keeps transport accessible without horizontal clipping", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openFixture(page);
  await expect(
    page.getByRole("button", { name: "Start timed cues", exact: true }),
  ).toBeInViewport();
  await page.getByRole("tab", { name: /Repairs/ }).click();
  await expect(
    page.getByRole("region", { name: "After b1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview this candidate", exact: true })
    .click();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({
    path: testInfo.outputPath("workbench-mobile.png"),
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
});

test("service failure offers recovery without loading synthetic fallback", async ({
  page,
}) => {
  await page.route("**/api/state", async (route) => {
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("alert")).toContainText(
    "Application service unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Retry connection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic test scene", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Your story starts with three objects.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/state");
  await page.route("**/api/state", async (route) => {
    await route.fulfill({ json: fixtureState() });
  });
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A light left on", level: 1 }),
  ).toBeVisible();
});

test("malformed state fails visibly instead of becoming a scene", async ({
  page,
}) => {
  await page.route("**/api/state", async (route) => {
    await route.fulfill({ json: { current: "<script>untrusted</script>" } });
  });
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("alert")).toContainText("incompatible scene");
  await expect(
    page.getByRole("navigation", { name: "Scene beats" }).getByRole("button"),
  ).toHaveCount(0);
});

test("revoked approval and uncertain delivery remain inspectable in the compact studio", async ({
  page,
}) => {
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      json: {
        ...fixtureState(),
        approvalHold: true,
        approvals: [
          {
            proposalId: "synthetic-original",
            revisionId: syntheticRevision.id,
            digest: "a".repeat(64),
            revoked: true,
          },
        ],
        deliveries: [
          {
            id: "synthetic-outbox",
            role: "stage",
            status: "uncertain",
            error: "Synthetic interrupted delivery.",
          },
        ],
      },
    });
  });
  await page.goto("/studio?view=stage");
  await expect(page.getByRole("alert")).toContainText("Collaboration on hold");
  await expect(
    page.getByText("× Approval revoked", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(
    page.getByText("stage delivery · uncertain", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Check the actual Switch room history before retrying.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("Approved scene", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Take away", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Offline cue player", exact: false }),
  ).toHaveCount(0);
});

test('first-use guide explains the task and opens only matching approved files', async ({ page }) => {
  const state = fixtureState();
  state.constraints = [];
  state.proposals = [];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/studio?view=stage');
  const guide = page.locator('.getting-started');
  await expect(guide.getByRole('heading', { name: 'A short play for your table.' })).toBeVisible();
  await expect(guide).toContainText('You read the lines aloud and move three objects.');
  for (const prop of state.current.props) await expect(guide).toContainText(prop.name);
  await expect(guide.getByRole('link', { name: 'Read the full script' })).toHaveAttribute('href', state.artifacts[0]!.scriptUrl);
  await expect(guide.getByRole('link', { name: 'Open the step-by-step player' })).toHaveAttribute('href', state.artifacts[0]!.cueUrl);
  await guide.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(guide.getByRole('heading')).not.toBeVisible();
  await page.keyboard.press('Enter');
  await expect(guide.getByRole('heading')).toBeVisible();
  await guide.getByRole('button', { name: 'Tell us what happened' }).click();
  await expect(page.getByRole('tab', { name: 'Record' })).toHaveAttribute('aria-selected', 'true');
});

test('first-use guide does not invite performance of a draft or a scene needing repair', async ({ page }) => {
  const state = fixtureState();
  await page.route('**/api/state', route => route.fulfill({ json: { ...state, needsRepair: true } }));
  await page.goto('/studio?view=stage');
  await expect(page.locator('.getting-started')).toContainText('A change needs attention before you perform.');
  await expect(page.getByRole('link', { name: 'Open the step-by-step player' })).toHaveCount(0);
  await page.unroute('**/api/state');
  await page.route('**/api/state', route => route.fulfill({ json: { ...state, current: null, currentDigest: null, constraints: [], artifacts: [] } }));
  await page.reload();
  await expect(page.locator('.getting-started')).toContainText('This is a draft.');
  await expect(page.getByRole('link', { name: 'Open the step-by-step player' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read the full script' })).toHaveCount(0);
});


test('approval clipboard failure reveals the exact addressed message for manual copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
  });
  await openFixture(page);
  await page.getByRole('tab', { name: /Repairs/ }).click();
  await expect(page.locator('.copy-command')).not.toBeVisible();
  await page.getByRole('button', { name: 'Copy approval command' }).click();
  await expect(page.locator('.copy-command')).toBeVisible();
  await expect(page.locator('.copy-command')).toContainText('@two-hands-stage approve synthetic-proposal');
  await expect(page.getByRole('status')).toContainText('clipboard access is unavailable');
});
