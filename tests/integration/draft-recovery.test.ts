import { afterEach, describe, expect, it } from 'vitest';
import { canonicalize } from '@two-hands/domain';
import { Store } from '../../apps/api/src/store.js';
import { syntheticRevision } from '../../fixtures/scene.js';
import { syntheticConfig, syntheticEvent, ingestHuman, claimRequired, seedEligible, seedApproved, relayHandoffs } from '../../fixtures/service.js';
const stores: Store[] = [];
function fixture() { const store = new Store(syntheticConfig()); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function brief(store: Store) {
  const input = { sceneId: syntheticRevision.sceneId, title: syntheticRevision.title, props: syntheticRevision.props, emotionalGoal: syntheticRevision.emotionalGoal, protectedFact: syntheticRevision.protectedFact };
  return ingestHuman(store, `brief ${JSON.stringify(input)}`);
}
function blocked(store: Store) { brief(store); const job = claimRequired(store, 'writer'); store.fail('writer', job.id); }
function rejected(store: Store) {
  brief(store); const job = claimRequired(store, 'writer'); const candidate = structuredClone(syntheticRevision);
  candidate.beats[1]!.actions = [{ type: 'hold', propId: 'p2', hand: 'left', from: 'table' }];
  return store.createProposals('writer', job.id, [{ candidate, artisticCosts: ['Synthetic invalid output for recovery testing.'] }])[0]!;
}
function retry(store: Store) { return ingestHuman(store, 'retry-draft', 'writer'); }

describe('bounded human-authorized draft recovery — synthetic service cases', () => {
  it('retries a rejected draft without changing the brief and uses the normal review/approval path', () => {
    const store = fixture(); const old = rejected(store);
    relayHandoffs(store, 'writer'); const stage = claimRequired(store, 'stage');
    store.review('stage', stage.id, [{ proposalId: old.id, explanation: 'The left hand already holds the boat.' }]);
    const original = canonicalize(store.state().brief);
    expect(store.state().retryDraft).toMatchObject({ eligible: true, remaining: 2 });
    expect(retry(store).result).toMatchObject({ accepted: true });
    expect(canonicalize(store.state().brief)).toBe(original);
    expect(store.state().retryDraft).toMatchObject({ eligible: false, remaining: 1 });
    const writer = claimRequired(store, 'writer');
    const next = store.createProposals('writer', writer.id, [{ candidate: syntheticRevision, artisticCosts: ['Synthetic corrected draft.'] }])[0]!;
    relayHandoffs(store, 'writer'); const review = claimRequired(store, 'stage');
    store.review('stage', review.id, [{ proposalId: next.id, explanation: 'Symbolic checks pass; human rehearsal remains pending.' }]);
    expect(ingestHuman(store, `approve ${next.id} ${next.candidate.id} ${next.digest}`).result).toMatchObject({ accepted: true });
    expect(store.current()?.id).toBe(next.candidate.id); expect(store.proposal(old.id).status).toBe('rejected');
    expect(store.state().rehearsals).toEqual([]);
  });
  it('counts logical duplicates once and permits at most two retries', () => {
    const store = fixture(); blocked(store); const first = retry(store);
    expect(first.result).toMatchObject({ accepted: true });
    expect(store.ingest('writer', first.event)).toMatchObject({ duplicate: true });
    expect(store.ingest('writer', { ...first.event, id: first.event.id + 100000, data: { ...first.event.data, sequence: first.event.id + 100000 } })).toMatchObject({ duplicate: true });
    expect(store.get('draftRetries', 0)).toBe(1);
    const second = claimRequired(store, 'writer'); store.fail('writer', second.id);
    expect(retry(store).result).toMatchObject({ accepted: true });
    const third = claimRequired(store, 'writer'); store.fail('writer', third.id);
    expect(retry(store).result).toMatchObject({ rejected: true });
    expect(store.state().retryDraft).toMatchObject({ eligible: false, remaining: 0 }); expect(store.state().jobs).toHaveLength(3);
  });
  it('requires the authorized human and the addressed writer', () => {
    const store = fixture(); blocked(store);
    for (const sender of [store.config.stageParticipantId, '@unmapped:switch.invalid']) store.ingest('writer', syntheticEvent(store.config, '@two-hands-writer retry-draft', { sender }));
    ingestHuman(store, 'retry-draft', 'stage');
    expect(store.get('draftRetries', 0)).toBe(0); expect(store.state().jobs).toHaveLength(1);
    expect(retry(store).result).toMatchObject({ accepted: true });
  });
  it('refuses retries while work is pending/running or a candidate is eligible', () => {
    const pending = fixture(); brief(pending); expect(retry(pending).result).toMatchObject({ rejected: true });
    claimRequired(pending, 'writer'); expect(retry(pending).result).toMatchObject({ rejected: true });
    const eligible = fixture(); seedEligible(eligible); expect(retry(eligible).result).toMatchObject({ rejected: true });
  });
  it('allows a blocked initial review to be replaced and invalidates its candidate', () => {
    const store = fixture(); brief(store); const writer = claimRequired(store, 'writer');
    const candidate = store.createProposals('writer', writer.id, [{ candidate: syntheticRevision, artisticCosts: ['Synthetic first draft.'] }])[0]!;
    expect(store.state().retryDraft.eligible).toBe(false);
    relayHandoffs(store, 'writer'); const stage = claimRequired(store, 'stage');
    expect(retry(store).result).toMatchObject({ rejected: true }); store.fail('stage', stage.id);
    expect(retry(store).result).toMatchObject({ accepted: true }); expect(store.proposal(candidate.id).status).toBe('invalidated');
  });
  it('rejects delayed peer handoffs from the prior generation', () => {
    const store = fixture(); rejected(store); const delayed = store.nextOutbox('writer')!;
    expect(retry(store).result).toMatchObject({ accepted: true });
    expect(store.ingest('stage', syntheticEvent(store.config, delayed.content, { sender: store.config.writerParticipantId, bridgeId: null }))).toMatchObject({ rejected: true, stale: true });
    expect(store.claim('stage')).toBeNull(); expect(store.state().jobs.filter((job) => job.status === 'pending')).toHaveLength(1);
  });
  it('does not permit a changed brief, missing brief, approved revision, or revocation hold', () => {
    const empty = fixture(); expect(retry(empty).result).toMatchObject({ rejected: true });
    const approved = fixture(); seedApproved(approved); expect(retry(approved).result).toMatchObject({ rejected: true });
    const held = fixture(); const source = brief(held); const writer = claimRequired(held, 'writer'); held.fail('writer', writer.id);
    expect(ingestHuman(held, 'retry-draft new-brief', 'writer').result).toMatchObject({ rejected: true });
    ingestHuman(held, `revoke ${source.event.data.payload.message_id}`);
    expect(retry(held).result).toMatchObject({ rejected: true }); expect(held.get('draftRetries', 0)).toBe(0);
  });
  it('includes the retry command only when a failure is eligible for recovery', () => {
    const failed = fixture(); blocked(failed); expect(failed.nextOutbox('writer')?.content).toContain('@two-hands-writer retry-draft');
    const eligible = fixture(); seedEligible(eligible); expect(eligible.nextOutbox('stage')?.content).not.toContain('retry-draft');
  });
});
