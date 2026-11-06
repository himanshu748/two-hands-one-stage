import { test, expect } from "@playwright/test";
import {
  exampleOriginal,
  exampleRepairs,
} from "../../apps/web/src/landing-example.js";
import { validateScene } from "@two-hands/domain";

test("landing is independent of live state and its tabletop follows real fixture transitions", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiRequests.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Stories you canactuallyperform.",
  );
  const stage = page.getByRole("figure", {
    name: "Interactive example tabletop",
  });
  await expect(
    stage.getByRole("button", {
      name: "Inspect Paper boat, on the table",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play next example beat", exact: true })
    .click();
  await expect(
    stage.getByRole("button", {
      name: "Inspect Paper boat, in the left hand",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview example beat 3", exact: true })
    .click();
  await expect(
    stage.getByRole("button", {
      name: "Inspect Paper boat, on the resting place",
      exact: true,
    }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(
    await stage
      .locator(".stage-token-position")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration)),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "Open live room", exact: false }),
  ).toHaveAttribute("href", "/studio");
});

test("constraint experiment changes hands and artistic cost without approving anything", async ({
  page,
}) => {
  await page.goto("/");
  const lab = page.locator("#repair-lab");
  await expect(
    lab.getByRole("button", { name: /Let the boat wait/ }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /Keep the left hand free/ }).check();
  await expect(lab.getByRole("status")).toContainText(
    "all six beats model checked",
  );
  await expect(lab.locator(".lp-artistic-cost")).toContainText(
    "patient rather than protective",
  );
  await lab
    .getByRole("button", { name: /Make the light arrive later/ })
    .click();
  await expect(
    lab.getByRole("button", {
      name: "Inspect Paper boat, in the right hand",
      exact: true,
    }),
  ).toBeVisible();
  await expect(lab.locator(".lp-artistic-cost")).toContainText(
    "lighthouse arrive a beat later",
  );
  await lab.getByRole("button", { name: "Original", exact: true }).click();
  await expect(lab.getByRole("status")).toContainText("repair required");
  await expect(
    lab.getByRole("button", {
      name: "Inspect Paper boat, in the left hand",
      exact: true,
    }),
  ).toBeVisible();
  await lab.getByRole("button", { name: "Repair", exact: true }).click();
  await expect(lab.getByRole("status")).toContainText(
    "all six beats model checked",
  );
  await expect(page.getByRole("button", { name: /^approve/i })).toHaveCount(0);
  for (const repair of exampleRepairs) {
    expect(validateScene(repair.revision).valid).toBe(true);
    expect(repair.revision.protectedFact).toBe(exampleOriginal.protectedFact);
  }
});

test("sample export links open actual matching static HTML artifacts", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const cueLink = page.getByRole("link", {
    name: "Try the sample cue player",
    exact: false,
  });
  const scriptLink = page.getByRole("link", {
    name: "Read the sample script",
    exact: false,
  });
  const cue = await request.get((await cueLink.getAttribute("href"))!);
  const script = await request.get((await scriptLink.getAttribute("href"))!);
  expect(cue.ok()).toBe(true);
  expect(script.ok()).toBe(true);
  const cueText = await cue.text(),
    scriptText = await script.text();
  for (const field of ["revision-id", "content-digest"]) {
    const pattern = new RegExp('name="' + field + '" content="([^"]+)"');
    const value = cueText.match(pattern)?.[1];
    expect(value).toBeTruthy();
    expect(scriptText.match(pattern)?.[1]).toBe(value);
  }
  expect(cueText).toMatch(/synthetic/i);
  expect(scriptText).toMatch(/synthetic/i);
  const popupPromise = page.waitForEvent("popup");
  await cueLink.click();
  const popup = await popupPromise;
  await expect(popup.getByRole("button", { name: "Start the scene", exact: true })).toBeVisible();
});

test("mobile landing stays readable with keyboard controls and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  const toggle = page.getByRole("checkbox", {
    name: /Keep the left hand free/,
  });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  const token = page
    .locator(".lp-repair-preview .stage-token-position")
    .first();
  expect(
    await token.evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  const faq = page
    .locator("summary")
    .filter({ hasText: "Is the animated example a real agent session?" });
  await faq.click();
  await expect(
    page.getByText("No. The examples on this page", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
