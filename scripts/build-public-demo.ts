import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicDemoState } from '../fixtures/public-demo.js';
import { renderArtifact } from '../apps/api/src/render.js';

/** Generates only labeled public fixtures. Does not load .env or access live services. */
export async function buildPublicDemo(outputDirectory = fileURLToPath(new URL('../apps/web/public/examples/', import.meta.url))) {
  const state = buildPublicDemoState();
  await mkdir(outputDirectory, { recursive: true });
  for (const artifact of state.artifacts) {
    const proposal = state.proposals.find(p => p.candidate.id === artifact.revisionId && p.status === 'committed');
    if (!proposal) throw new Error('Public fixture artifact requires its synthetic approved revision');
    const directory = resolve(outputDirectory, 'artifacts', artifact.revisionId);
    await mkdir(directory, { recursive: true });
    for (const kind of ['cue', 'script'] as const) await writeFile(resolve(directory, `${kind}.html`), renderArtifact(proposal.candidate, artifact.digest, kind, true));
  }
  await writeFile(resolve(outputDirectory, 'collaboration-state.json'), JSON.stringify(state, null, 2) + '\n');
  return state;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildPublicDemo();
  console.info('Built an explicitly synthetic public collaboration walkthrough and two matching HTML files. No live services or credentials accessed.');
}
