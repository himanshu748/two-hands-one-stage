import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { canonicalize } from '@two-hands/domain';
import { syntheticRevision } from '../../fixtures/scene.js';
import { renderArtifact } from '../../apps/api/src/render.js';

/** Synthetic artifact tests: file playback is real; the approval and scene are fixtures. */
const digest = createHash('sha256').update(canonicalize(syntheticRevision)).digest('hex');

test('offline file runs timed cues, pauses by keyboard, and requires a prop reset', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('synthetic-cue.html');
  await writeFile(file, renderArtifact(syntheticRevision, digest, 'cue', true));
  const externalRequests: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  await page.context().setOffline(true);
  await page.clock.install();
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByRole('heading', { name: 'A light left on', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic test artifact.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the scene' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start the scene' }).click();
  await expect(page.getByRole('status')).toHaveText('Hands ready in 5…');
  await page.clock.runFor(5000);
  await expect(page.getByRole('status')).toHaveText('Part 1 of 6 · The empty shore');
  await expect(page.locator('#remaining')).toHaveText('12 seconds remaining');
  await page.clock.runFor(12000);
  await expect(page.getByRole('heading', { name: 'A small lighthouse', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toHaveText('Paused — put the objects back, then start over');
  await page.clock.runFor(30000);
  await expect(page.getByRole('heading', { name: 'A small lighthouse', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the scene' })).toBeDisabled();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('heading', { name: 'The empty shore', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeFocused();
  expect(externalRequests).toEqual([]);
});

test('offline completion never invents a human rehearsal and remains usable on mobile', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('synthetic-cue-complete.html');
  await writeFile(file, renderArtifact(syntheticRevision, digest, 'cue', true));
  await page.context().setOffline(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start the scene' }).click();
  await page.clock.runFor(5000 + 6 * 12000);
  await expect(page.getByRole('status')).toHaveText('Scene finished. How did it feel?');
  await expect(page.locator('#end-note')).toBeVisible();
  await expect(page.locator('#end-note')).toContainText(`outcome ${syntheticRevision.id} success|difficulty`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('offline-cue-mobile.png'), fullPage: true });
});

test('printable file includes every beat, matching immutable metadata, and escaped text', async ({ page }, testInfo) => {
  const revision = structuredClone(syntheticRevision);
  revision.beats[0]!.dialogue = '</script><script>window.injected = true</script><img src=x onerror=alert(1)>';
  const matchingDigest = createHash('sha256').update(canonicalize(revision)).digest('hex');
  const file = testInfo.outputPath('synthetic-script.html');
  await writeFile(file, renderArtifact(revision, matchingDigest, 'script', true));
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(file).href);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('article.beat')).toHaveCount(6);
  for (const beat of revision.beats) await expect(page.getByRole('heading', { name: beat.title, exact: true })).toBeVisible();
  await expect(page.locator('meta[name="revision-id"]')).toHaveAttribute('content', revision.id);
  await expect(page.locator('meta[name="content-digest"]')).toHaveAttribute('content', matchingDigest);
  await expect(page.locator('.dialogue').first()).toHaveText(revision.beats[0]!.dialogue);
  await expect(page.locator('img,script,form')).toHaveCount(0);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
});

test('artifact links from the fixture application open matching approved exports', async ({ request, page }) => {
  const response = await request.get('/api/state');
  expect(response.ok()).toBe(true);
  const state = await response.json() as { synthetic: boolean; artifacts: Array<{ revisionId: string; digest: string; cueUrl: string; scriptUrl: string }> };
  expect(state.synthetic).toBe(true);
  const artifact = state.artifacts[0];
  expect(artifact, 'fixture server must seed an explicitly synthetic approved revision').toBeDefined();
  for (const url of [artifact!.cueUrl, artifact!.scriptUrl]) {
    await page.goto(url);
    await expect(page.locator('meta[name="revision-id"]')).toHaveAttribute('content', artifact!.revisionId);
    await expect(page.locator('meta[name="content-digest"]')).toHaveAttribute('content', artifact!.digest);
    await expect(page.getByText('Synthetic test artifact.', { exact: false })).toBeVisible();
  }
});


test('read-through shows every part without starting the timer, while technical details stay optional', async ({ page }, testInfo) => {
  const revision = structuredClone(syntheticRevision);
  revision.beats[0]!.dialogue = 'Say this only when the ordered action reaches this line.';
  revision.beats[0]!.actions = [{ type: 'pause', seconds: 1 }, { type: 'speak', text: revision.beats[0]!.dialogue }, { type: 'hold', propId: 'p1', hand: 'left', from: 'table' }];
  const matchingDigest = createHash('sha256').update(canonicalize(revision)).digest('hex');
  const file = testInfo.outputPath('synthetic-read-through.html');
  await writeFile(file, renderArtifact(revision, matchingDigest, 'cue', true));
  await page.context().setOffline(true);
  await page.clock.install();
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByText('A short story you perform with three objects.')).toBeVisible();
  await expect(page.locator('.identity')).not.toBeVisible();
  await expect(page.locator('article.beat:visible')).toHaveCount(1);
  await expect(page.locator('#b1 .dialogue')).toHaveCount(1);
  await expect(page.locator('#b1 .actions > li').nth(0)).toContainText('Wait 1 second.');
  await expect(page.locator('#b1 .actions > li').nth(1)).toContainText(revision.beats[0]!.dialogue);
  await page.getByRole('button', { name: 'Read the whole scene' }).click();
  await expect(page.locator('article.beat:visible')).toHaveCount(6);
  await page.clock.runFor(90000);
  await expect(page.getByRole('status')).toHaveText('Ready when you are · five-second countdown');
  await expect(page.locator('#end-note')).not.toBeVisible();
  await page.getByText('About this scene & version details', { exact: true }).click();
  await expect(page.locator('.identity')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start the scene' }).click();
  await expect(page.locator('article.beat:visible')).toHaveCount(1);
  await page.clock.runFor(5000);
  await expect(page.getByRole('status')).toHaveText('Part 1 of 6 · The empty shore');
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read the whole scene' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});
