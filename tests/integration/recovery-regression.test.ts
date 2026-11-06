import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../apps/api/src/store.js';
import { claimRequired, ingestHuman, relayHandoffs, seedApproved, syntheticConfig, syntheticEvent } from '../../fixtures/service.js';
import type { Observation } from '../../apps/api/src/types.js';

/** Synthetic durability regressions; no genuine Switch event or rehearsal evidence. */
const stores: Store[] = [];
const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const store of stores.splice(0)) { if (store.db.open) store.close(); }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function memoryStore(): Store { const store = new Store(syntheticConfig()); stores.push(store); return store; }
function observation(store: Store, text: string): Observation {
  ingestHuman(store, `observe ${store.current()!.id} ${text}`);
  const job = claimRequired(store, 'stage');
  return store.interpret('stage', job.id, 'Please confirm whether the left hand needs to remain free throughout.');
}
function repairRequest(store: Store): { id: string; content: string } {
  const row = store.db.prepare("SELECT id,content FROM outbox WHERE content LIKE '%TWOHANDS %repair_request%' ORDER BY rowid DESC LIMIT 1").get() as { id: string; content: string } | undefined;
  if (!row) throw new Error('Synthetic setup expected a persisted repair handoff');
  return row;
}
function deliverRepair(store: Store, request: { id: string; content: string }) {
  return store.ingest('writer', syntheticEvent(store.config, request.content, { sender: store.config.stageParticipantId, bridgeId: null, messageId: `synthetic-delayed-${request.id}` }));
}

describe('originating revision and constraint state survive Switch delivery delays', () => {
  it('rejects an old repair handoff after new feedback, without silently rebasing a job', () => {
    const store = memoryStore(); seedApproved(store);
    const original = observation(store, 'Synthetic observation: the left-hand action is awkward.');
    ingestHuman(store, `confirm ${original.id} left`);
    const delayed = repairRequest(store);
    const payload = JSON.parse(delayed.content.slice(delayed.content.indexOf('TWOHANDS ') + 9)) as { baseRevisionId: string; generation: number };
    expect(payload.baseRevisionId).toBe(store.current()!.id);
    const oldGeneration = payload.generation;
    observation(store, 'Synthetic second difficulty that still needs interpretation confirmation.');
    expect(store.get('generation', 0)).toBeGreaterThan(oldGeneration);
    expect(deliverRepair(store, delayed)).toMatchObject({ rejected: true, stale: true });
    expect(store.claim('writer')).toBeNull();
    expect(store.state().deliveries.some((item) => item.id.endsWith(':stale') && item.status === 'pending')).toBe(true);
    expect(deliverRepair(store, delayed)).toMatchObject({ duplicate: true });
    expect(store.state().deliveries.filter((item) => item.id.endsWith(':stale'))).toHaveLength(1);
  });

  it('rejects a handoff against an earlier approved revision even if its generation is made current', () => {
    const store = memoryStore(); seedApproved(store);
    const o = observation(store, 'Synthetic request that will be delayed.');
    ingestHuman(store, `confirm ${o.id} left`);
    const delayed = repairRequest(store);
    const oldBase = store.current()!;
    // A separate synthetic repair travels through the normal proposal/review/approval path.
    store.enqueue('synthetic-newer-repair', 'writer', 'repair', {});
    const job = claimRequired(store, 'writer');
    const patch = { beats: [
      { ...oldBase.beats[0]!, actions: [{ type: 'pause' as const, seconds: 2 }] },
      { ...oldBase.beats[2]!, actions: [{ type: 'move' as const, propId: 'p1', hand: 'right' as const, from: 'table' as const, to: 'rest' as const }] },
    ] };
    const candidate = store.createProposals('writer', job.id, [{ patch, artisticCosts: ['The boat stays on the table during the opening.'] }])[0]!;
    relayHandoffs(store, 'writer');
    const review = claimRequired(store, 'stage');
    store.review('stage', review.id, [{ proposalId: candidate.id, explanation: 'Synthetic review: both changed beats leave the left hand unused.' }]);
    expect(ingestHuman(store, `approve ${candidate.id} ${candidate.candidate.id} ${candidate.digest}`).result).toMatchObject({ accepted: true });
    expect(store.current()!.id).not.toBe(oldBase.id);
    // Isolate the base guard from the independent generation guard.
    const parsed = JSON.parse(delayed.content.slice(delayed.content.indexOf('TWOHANDS ') + 9)) as { generation: number };
    store.set('generation', parsed.generation);
    expect(deliverRepair(store, delayed)).toMatchObject({ rejected: true, stale: true });
    expect(store.claim('writer')).toBeNull();
  });

  it('retains the origin in accepted peer jobs rather than replacing it with ingestion-time values', () => {
    const store = memoryStore(); seedApproved(store);
    const o = observation(store, 'Synthetic one-hand restriction.');
    ingestHuman(store, `confirm ${o.id} left`);
    const request = repairRequest(store);
    expect(deliverRepair(store, request)).toMatchObject({ accepted: true });
    const claimed = claimRequired(store, 'writer');
    const parsed = JSON.parse(request.content.slice(request.content.indexOf('TWOHANDS ') + 9)) as Record<string, unknown>;
    expect(claimed.payload.baseRevisionId).toBe(parsed.baseRevisionId);
    expect(claimed.payload.generation).toBe(parsed.generation);
  });
});

describe('approval holds retain every unresolved human constraint and permanent revocation', () => {
  it('does not release the hold or request repairs until every current observation is confirmed', () => {
    const store = memoryStore(); seedApproved(store);
    const first = observation(store, 'Synthetic first left-hand difficulty.');
    const second = observation(store, 'Synthetic second left-hand difficulty.');
    expect(ingestHuman(store, `confirm ${first.id} left`).result).toMatchObject({ accepted: true });
    expect(store.state().approvalHold).toBe(true);
    expect(store.get('hold', false)).toBe(true);
    expect(store.db.prepare("SELECT id FROM outbox WHERE content LIKE '%TWOHANDS %repair_request%'").all()).toHaveLength(0);
    expect(ingestHuman(store, `outcome ${store.current()!.id} success Synthetic outcome must remain blocked.`).result).toMatchObject({ rejected: true });
    expect(ingestHuman(store, `confirm ${second.id} left`).result).toMatchObject({ accepted: true });
    expect(store.state().approvalHold).toBe(false);
    expect(store.state().constraints).toHaveLength(2);
    expect(store.db.prepare("SELECT id FROM outbox WHERE content LIKE '%TWOHANDS %repair_request%'").all()).toHaveLength(1);
  });

  it.each(['revoke', 'edit'] as const)('cannot clear a permanent %s hold by confirming an existing observation', (kind) => {
    const store = memoryStore(); seedApproved(store);
    const o = observation(store, 'Synthetic observation pending when the approval is withdrawn.');
    const approval = store.db.prepare('SELECT message_id FROM approvals').get() as { message_id: string };
    const messageId = approval.message_id.slice(store.config.roomId.length + 1);
    if (kind === 'revoke') ingestHuman(store, `revoke ${messageId}`);
    else store.ingest('stage', syntheticEvent(store.config, 'Withdrawn synthetic approval', { messageId, addressed: false }));
    expect(ingestHuman(store, `confirm ${o.id} left`).result).toMatchObject({ rejected: true });
    expect(store.get('permanentHold', false)).toBe(true);
    expect(store.get('hold', false)).toBe(true);
    expect(store.state().approvalHold).toBe(true);
    expect(store.state().observations.find((item) => item.id === o.id)?.status).toBe('awaiting_confirmation');
  });
});

describe('independent worker delivery recovery and explicit reconciliation', () => {
  it('expires an abandoned send with the API still alive, then permits an evidenced bounded retry', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T00:00:00Z'));
    const store = memoryStore(); store.notify('synthetic-abandoned-send', 'stage', 'Synthetic notification');
    expect(store.nextOutbox('stage')?.id).toBe('synthetic-abandoned-send');
    expect(store.state().deliveries[0]?.status).toBe('sending');
    // The worker disappears without ACK; the same Store/API remains running.
    vi.advanceTimersByTime(60_001);
    expect(store.state().deliveries[0]).toMatchObject({ status: 'uncertain', error: expect.stringContaining('lease expired') });
    expect(store.nextOutbox('stage')).toBeNull();
    expect(store.reconcileOutbox('stage', 'synthetic-abandoned-send', 'retry', 'Synthetic operator checked the whole room history and found no matching message.')).toEqual({ id: 'synthetic-abandoned-send', status: 'pending' });
    expect(store.nextOutbox('stage')?.id).toBe('synthetic-abandoned-send');
    store.outboxResult('stage', 'synthetic-abandoned-send', true);
    expect(store.state().deliveries[0]?.status).toBe('sent');
    expect(store.get<unknown[]>('outbox-reconciliation:synthetic-abandoned-send', [])).toHaveLength(1);
  });

  it('only reconciles uncertain entries with evidence and the owning role, and caps sends at three', () => {
    const store = memoryStore(); store.notify('synthetic-bounded-send', 'writer', 'Synthetic notification');
    expect(() => store.reconcileOutbox('writer', 'synthetic-bounded-send', 'retry', 'Synthetic operator checked room history.')).toThrow('uncertain');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(store.nextOutbox('writer')?.id).toBe('synthetic-bounded-send');
      store.outboxResult('writer', 'synthetic-bounded-send', false);
      expect(() => store.reconcileOutbox('stage', 'synthetic-bounded-send', 'delivered', 'Synthetic operator checked room history.')).toThrow('owned');
      expect(() => store.reconcileOutbox('writer', 'synthetic-bounded-send', 'retry', 'short')).toThrow();
      if (attempt < 3) store.reconcileOutbox('writer', 'synthetic-bounded-send', 'retry', 'Synthetic operator found no matching room message and explicitly requests retry.');
    }
    expect(() => store.reconcileOutbox('writer', 'synthetic-bounded-send', 'retry', 'Synthetic operator requests another retry after the budget.')).toThrow('budget exhausted');
    expect(store.nextOutbox('writer')).toBeNull();
    store.reconcileOutbox('writer', 'synthetic-bounded-send', 'delivered', 'Synthetic operator found the matching room message and verified its complete contents.');
    expect(store.state().deliveries[0]?.status).toBe('sent');
    expect(store.db.prepare('SELECT attempts FROM outbox WHERE id=?').get('synthetic-bounded-send')).toEqual({ attempts: 3 });
  });

  it('migrates an existing v1 outbox without deleting its pending messages', () => {
    const directory = mkdtempSync(join(tmpdir(), 'two-hands-outbox-v1-')); directories.push(directory);
    const config = syntheticConfig(join(directory, 'demo.sqlite'));
    const first = new Store(config); stores.push(first);
    first.notify('synthetic-preserved-delivery', 'writer', 'Preserve this synthetic message');
    first.db.exec('ALTER TABLE outbox DROP COLUMN lease_until; PRAGMA user_version=1');
    first.close();
    const migrated = new Store(config); stores.push(migrated);
    expect(migrated.db.pragma('user_version', { simple: true })).toBe(2);
    expect(migrated.nextOutbox('writer')).toEqual({ id: 'synthetic-preserved-delivery', content: 'Preserve this synthetic message' });
  });
});
