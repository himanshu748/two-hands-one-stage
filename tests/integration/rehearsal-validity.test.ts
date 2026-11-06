import { afterEach, describe, expect, it } from 'vitest';
import type { Beat } from '@two-hands/domain';
import { Store } from '../../apps/api/src/store.js';
import { syntheticConfig, seedApproved, ingestHuman, claimRequired, relayHandoffs } from '../../fixtures/service.js';

const stores: Store[] = [];
function fixtureStore() { const store = new Store(syntheticConfig()); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function confirmLeftConstraint(store: Store) {
  const revision = store.current(); if (!revision) throw new Error('Synthetic setup requires approval');
  ingestHuman(store, `observe ${revision.id} Synthetic difficulty: my left hand must remain free.`);
  const job = claimRequired(store, 'stage');
  const observation = store.interpret('stage', job.id, 'Synthetic interpretation: confirm keeping the left hand free throughout.');
  ingestHuman(store, `confirm ${observation.id} left`);
}
function approveLeftFreeRepair(store: Store) {
  relayHandoffs(store, 'stage');
  const writer = claimRequired(store, 'writer');
  const base = store.current()!;
  const beats: Beat[] = [
    { ...base.beats[0]!, actions: [{ type: 'pause', seconds: 2 }] },
    { ...base.beats[2]!, actions: [{ type: 'move', propId: 'p1', hand: 'right', from: 'table', to: 'rest' }] },
  ];
  const proposal = store.createProposals('writer', writer.id, [{ patch: { beats }, artisticCosts: ['The boat waits on the table until the third beat.'] }])[0]!;
  relayHandoffs(store, 'writer');
  const reviewer = claimRequired(store, 'stage');
  store.review('stage', reviewer.id, [{ proposalId: proposal.id, explanation: 'Synthetic review: whole-scene checks pass with the left hand free.' }]);
  const result = ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`).result;
  expect(result).toMatchObject({ accepted: true });
  return store.proposal(proposal.id);
}

describe('rehearsal evidence after confirmed constraint changes — synthetic service cases', () => {
  it('keeps historical success without treating the current revision as repaired after confirmation', () => {
    const store = fixtureStore(); const original = seedApproved(store);
    ingestHuman(store, `outcome ${original.candidate.id} success Synthetic earlier attempt, not a physical rehearsal.`);
    expect(store.state().needsRepair).toBe(false);
    confirmLeftConstraint(store);
    const state = store.state();
    expect(state.approvalHold).toBe(false);
    expect(state.needsRepair).toBe(true);
    expect(state.current?.constraints).toEqual([]);
    expect(state.constraints[0]?.unavailableHand).toBe('left');
    expect(state.rehearsals).toHaveLength(1);
    expect(state.rehearsals[0]).toMatchObject({ revisionId: original.candidate.id, outcome: 'success', source: 'synthetic' });
  });
  it('rejects current success while confirmed constraints await a new approved revision', () => {
    const store = fixtureStore(); const original = seedApproved(store); confirmLeftConstraint(store);
    expect(ingestHuman(store, `outcome ${original.candidate.id} success Synthetic success must be rejected until repair.`).result).toMatchObject({ rejected: true });
    expect(store.state().rehearsals).toEqual([]);
    expect(store.state().needsRepair).toBe(true);
    expect(ingestHuman(store, `outcome ${original.candidate.id} difficulty Synthetic continued difficulty remains recordable.`).result).toMatchObject({ accepted: true });
    expect(store.state().rehearsals[0]?.outcome).toBe('difficulty');
  });
  it('clears repair-needed state only after exact repair approval, then accepts a separate outcome', () => {
    const store = fixtureStore(); seedApproved(store); confirmLeftConstraint(store);
    const repaired = approveLeftFreeRepair(store);
    expect(store.state().needsRepair).toBe(false);
    expect(store.state().rehearsals).toEqual([]);
    expect(store.current()?.constraints).toEqual(store.state().constraints);
    expect(ingestHuman(store, `outcome ${repaired.candidate.id} success Synthetic repaired revision outcome.`).result).toMatchObject({ accepted: true });
    expect(store.state().rehearsals[0]).toMatchObject({ revisionId: repaired.candidate.id, source: 'synthetic' });
  });
  it('records a delayed outcome for a historical approved revision without assigning it to the current revision', () => {
    const store = fixtureStore(); const original = seedApproved(store); confirmLeftConstraint(store);
    const repaired = approveLeftFreeRepair(store);
    expect(ingestHuman(store, `outcome ${original.candidate.id} success Synthetic delayed report about the earlier revision.`).result).toMatchObject({ accepted: true });
    const state = store.state();
    expect(state.current?.id).toBe(repaired.candidate.id);
    expect(state.needsRepair).toBe(false);
    expect(state.rehearsals.filter((record) => record.revisionId === state.current?.id)).toEqual([]);
    expect(state.rehearsals[0]?.revisionId).toBe(original.candidate.id);
  });
  it('does not mark an empty scene as needing repair', () => {
    const store = fixtureStore();
    expect(store.state().current).toBeNull(); expect(store.state().needsRepair).toBe(false);
  });
});
