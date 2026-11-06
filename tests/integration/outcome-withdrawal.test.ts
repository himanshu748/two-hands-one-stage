import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../../apps/api/src/store.js';
import { syntheticConfig, seedApproved, ingestHuman, syntheticEvent } from '../../fixtures/service.js';
const stores: Store[] = [];
function fixture() { const store = new Store(syntheticConfig()); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

describe('withdrawn rehearsal evidence — synthetic service cases', () => {
  it('derives withdrawal after explicit revocation without rewriting the original record', () => {
    const store = fixture(); const approved = seedApproved(store);
    const originalText = 'Synthetic earlier outcome that will be withdrawn.';
    const outcome = ingestHuman(store, `outcome ${approved.candidate.id} success ${originalText}`);
    const recordId = `${store.config.roomId}:${outcome.event.data.payload.message_id}`;
    const before = store.db.prepare('SELECT content FROM rehearsals WHERE id=?').get(recordId);
    expect(store.state().rehearsals[0]).toMatchObject({ text: originalText, withdrawn: false, source: 'synthetic' });
    ingestHuman(store, `revoke ${outcome.event.data.payload.message_id}`);
    expect(store.state().rehearsals[0]).toMatchObject({ text: originalText, outcome: 'success', withdrawn: true });
    expect(store.db.prepare('SELECT content FROM rehearsals WHERE id=?').get(recordId)).toEqual(before);
    expect(store.state().approvalHold).toBe(true);
    expect(store.state().approvals[0]?.revoked).toBe(false);
  });

  it('marks a same-ID edited outcome withdrawn, even when the edit removes addressing', () => {
    const store = fixture(); const approved = seedApproved(store);
    const outcome = ingestHuman(store, `outcome ${approved.candidate.id} success Synthetic original success record.`);
    const recordId = `${store.config.roomId}:${outcome.event.data.payload.message_id}`;
    const before = store.db.prepare('SELECT content FROM rehearsals WHERE id=?').get(recordId);
    const edit = syntheticEvent(store.config, 'Synthetic correction: disregard this outcome.', { messageId: outcome.event.data.payload.message_id, addressed: false });
    expect(store.ingest('stage', edit)).toMatchObject({ edited: true });
    expect(store.state().rehearsals[0]).toMatchObject({ text: 'Synthetic original success record.', withdrawn: true });
    expect(store.db.prepare('SELECT content FROM rehearsals WHERE id=?').get(recordId)).toEqual(before);
  });

  it('keeps separate outcomes distinct and does not treat identical replay as withdrawal', () => {
    const store = fixture(); const approved = seedApproved(store);
    const earlier = ingestHuman(store, `outcome ${approved.candidate.id} difficulty Synthetic earlier difficulty.`);
    const latest = ingestHuman(store, `outcome ${approved.candidate.id} success Synthetic later success.`);
    expect(store.ingest('stage', latest.event)).toMatchObject({ duplicate: true });
    expect(store.state().rehearsals.map((record) => record.withdrawn)).toEqual([false, false]);
    ingestHuman(store, `revoke ${latest.event.data.payload.message_id}`);
    const records = store.state().rehearsals;
    expect(records.map((record) => record.withdrawn)).toEqual([false, true]);
    expect(records[0]?.id).toBe(`${store.config.roomId}:${earlier.event.data.payload.message_id}`);
    expect(records[1]?.outcome).toBe('success');
  });
});
