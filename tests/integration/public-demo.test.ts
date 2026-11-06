import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, canonicalize, validateScene } from '@two-hands/domain';
import { WorkbenchStateSchema } from '../../apps/web/src/state.js';
import { buildPublicDemoState } from '../../fixtures/public-demo.js';
import { buildPublicDemo } from '../../scripts/build-public-demo.js';
import { digest } from '../../apps/api/src/store.js';

describe('public synthetic collaboration walkthrough', () => {
  it('builds a reproducible validated repair example without approving repairs or inventing performance', () => {
    const first = buildPublicDemoState();
    const second = buildPublicDemoState();
    expect(canonicalize(first)).toBe(canonicalize(second));
    const state = WorkbenchStateSchema.parse(first);
    expect(state.synthetic).toBe(true);
    expect(state.connection.status).toBe('disconnected');
    expect(state.rehearsals).toEqual([]);
    expect(state.approvals).toHaveLength(1);
    expect(state.proposals.filter(p => p.status === 'eligible')).toHaveLength(2);
    const kinds = state.collaboration.events.map(e => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['brief', 'review_request', 'approval', 'observation', 'interpretation', 'confirmation', 'repair_request', 'alternatives']));
    for (const proposal of state.proposals) {
      expect(proposal.digest).toBe(digest(proposal.candidate));
      expect(validateScene(proposal.candidate).valid).toBe(true);
      if (proposal.patch) expect(canonicalize(applyPatch(state.current!, proposal.patch, proposal.candidate.id, state.constraints))).toBe(canonicalize(proposal.candidate));
    }
    expect(JSON.stringify(state)).not.toMatch(/api[_-]?key|proxy[_-]?token|Bearer /i);
  });
  it('writes exactly matching synthetic cue and script metadata under public-only paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'two-hands-public-example-'));
    try {
      const state = await buildPublicDemo(directory);
      expect(JSON.parse(await readFile(join(directory, 'collaboration-state.json'), 'utf8')).synthetic).toBe(true);
      for (const artifact of state.artifacts) {
        for (const kind of ['cue', 'script']) {
          const html = await readFile(join(directory, 'artifacts', artifact.revisionId, `${kind}.html`), 'utf8');
          expect(html).toContain('Synthetic test artifact.');
          expect(html).toContain(`name="revision-id" content="${artifact.revisionId}"`);
          expect(html).toContain(`name="content-digest" content="${artifact.digest}"`);
          expect(html).not.toMatch(/(?:src|href)="https?:/);
        }
        expect(artifact.cueUrl).toMatch(/^\/examples\/artifacts\//);
        expect(artifact.scriptUrl).toMatch(/^\/examples\/artifacts\//);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
