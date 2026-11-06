import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { canonicalize } from '@two-hands/domain';
import { syntheticRevision } from '../fixtures/scene.js';
import { renderArtifact } from '../apps/api/src/render.js';

// Public examples are synthetic and never read or write the live scene database.
const digest = createHash('sha256').update(canonicalize(syntheticRevision)).digest('hex');
for (const kind of ['cue', 'script'] as const) {
  const file = new URL(`../apps/web/public/examples/synthetic-${kind}.html`, import.meta.url);
  await writeFile(file, renderArtifact(syntheticRevision, digest, kind, true));
}
console.info('Rendered two explicitly synthetic example files. No live scene or approval changed.');
