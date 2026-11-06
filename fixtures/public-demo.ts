import { canonicalize, validateScene, type Beat } from '@two-hands/domain';
import { Store, digest } from '../apps/api/src/store.js';
import type { State } from '../apps/api/src/types.js';
import { claimRequired, ingestHuman, seedEligible, syntheticConfig, syntheticEvent } from './service.js';

/** Public, explicitly synthetic walkthrough. Never accesses a local .env, persisted database, model or Switch. */
export function buildPublicDemoState(): State {
  const store = new Store(syntheticConfig());
  try {
    const original = seedEligible(store);
    deliverPublicFixture(store, 'stage');
    ingestHuman(store, `approve ${original.id} ${original.candidate.id} ${original.digest}`);
    deliverPublicFixture(store, 'stage');
    const result = ingestHuman(store, `observe ${original.candidate.id} Synthetic example: holding the boat makes it awkward to move the cup. I need my left hand free.`);
    if (!('accepted' in result.result)) throw new Error('Synthetic observation rejected');
    const interpreting = claimRequired(store, 'stage');
    const observation = store.interpret('stage', interpreting.id, 'Synthetic interpretation: keep the left hand free throughout. Confirm this only if it accurately describes the difficulty.');
    deliverPublicFixture(store, 'stage');
    ingestHuman(store, `confirm ${observation.id} left`);
    deliverPublicFixture(store, 'stage');
    const writing = claimRequired(store, 'writer');
    const base = store.current()!;
    const laterArrival: { beats: Beat[] } = { beats: [
      { ...base.beats[0]!, actions: [{ type: 'pause', seconds: 2 }] },
      { ...base.beats[2]!, actions: [{ type: 'move', propId: 'p1', hand: 'right', from: 'table', to: 'rest' }] },
    ] };
    const earlyArrival: { beats: Beat[] } = { beats: [
      { ...base.beats[0]!, actions: [{ type: 'move', propId: 'p1', hand: 'right', from: 'table', to: 'rest' }, { type: 'pause', seconds: 2 }] },
      { ...base.beats[2]!, actions: [{ type: 'pause', seconds: 2 }] },
    ] };
    const proposals = store.createProposals('writer', writing.id, [
      { patch: laterArrival, artisticCosts: ['The boat waits on the table in the opening. The welcome feels patient, but less protective.'] },
      { patch: earlyArrival, artisticCosts: ['The boat reaches the resting place before the lighthouse is made. The opening feels more decisive and loses some suspense.'] },
    ]);
    if (proposals.some(p => !p.validation.valid)) throw new Error('Synthetic repair must pass whole-scene validation');
    deliverPublicFixture(store, 'writer');
    const reviewing = claimRequired(store, 'stage');
    store.review('stage', reviewing.id, proposals.map(p => ({ proposalId: p.id, explanation: 'Synthetic review: the left hand stays free in all six parts. Both the opening and the later boat placement were changed together, so the later action no longer expects a boat in the left hand. A real performer still needs to try reach and timing.' })));
    deliverPublicFixture(store, 'stage');
    const state = stableFixtureIdentifiers(store.state());
    // This public view has examples of messages, not a live room or a performed outcome.
    state.connection = { status: 'disconnected', detail: 'Public synthetic walkthrough. No live Switch connection, model worker or human rehearsal is running.' };
    state.synthetic = true;
    state.rehearsals = [];
    state.artifacts = state.artifacts.map(a => ({ ...a, cueUrl: `/examples/artifacts/${encodeURIComponent(a.revisionId)}/cue.html`, scriptUrl: `/examples/artifacts/${encodeURIComponent(a.revisionId)}/script.html` }));
    return state;
  } finally { store.close(); }
}

/** Random fixture observation IDs and process-global test sequence counters become stable public example IDs. */
function stableFixtureIdentifiers(input: State): State {
  const replacements = new Map<string, string>();
  input.proposals.forEach((p, index) => replacements.set(p.candidate.id, `public-example-r${index + 1}`));
  const serialized = JSON.stringify(input);
  [...new Set(serialized.match(/\$synthetic-message-\d+/g) ?? [])].forEach((id, index) => replacements.set(id, `$public-example-message-${index + 1}`));
  [...new Set(serialized.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) ?? [])].forEach((id, index) => replacements.set(id, `public-observation-${index + 1}`));
  let normalized = serialized;
  for (const [before, after] of [...replacements].sort(([a], [b]) => b.length - a.length)) normalized = normalized.split(before).join(after);
  const result = JSON.parse(normalized) as State;
  const stamped = result.collaboration.events.flatMap(e => e.timestamp === null ? [] : [e.timestamp]);
  const first = Math.min(...stamped);
  result.collaboration.events.forEach(e => { if (e.timestamp !== null) e.timestamp = Date.UTC(2026, 10, 4) + e.timestamp - first; });
  // IDs occur inside revisions and constraints, so recompute every derived digest after normalization.
  result.proposals.forEach(p => { p.digest = digest(p.candidate); p.validation = validateScene(p.candidate); });
  result.currentDigest = result.current ? digest(result.current) : null;
  result.approvals.forEach(a => { const proposal = result.proposals.find(p => p.id === a.proposalId); if (proposal) a.digest = proposal.digest; });
  result.artifacts.forEach(a => { const proposal = result.proposals.find(p => p.candidate.id === a.revisionId); if (proposal) a.digest = proposal.digest; });
  // JSON reconstruction above must not change a candidate relative to its saved approved base.
  if (result.current && result.proposals.find(p => p.status === 'committed') && canonicalize(result.current) !== canonicalize(result.proposals.find(p => p.status === 'committed')!.candidate)) throw new Error('Synthetic approved snapshot mismatch');
  return result;
}

/** Explicit synthetic transport receipts, including notification echoes, keep the example chronology inspectable. */
function deliverPublicFixture(store: Store, role: 'writer' | 'stage') {
 for (let n=0;n<30;n++) {
  const message=store.nextOutbox(role);if(!message)return;
  store.outboxResult(role,message.id,true);
  store.ingest(role==='writer'?'stage':'writer',syntheticEvent(store.config,message.content,{sender:role==='writer'?store.config.writerParticipantId:store.config.stageParticipantId,bridgeId:null,senderName:`Synthetic ${role}`,messageId:`$synthetic-public-outbox-${message.id}`,addressed:message.content.includes('TWOHANDS ')}));
 }
 throw new Error('Synthetic public delivery bound exceeded');
}
