import { describe, expect, it } from 'vitest';
import { projectCollaboration, type InboxRow, type OutboxRow } from '../../apps/api/src/collaboration.js';
import { Store } from '../../apps/api/src/store.js';
import { claimRequired, ingestHuman, relayHandoffs, seedApproved, syntheticConfig, syntheticEvent } from '../../fixtures/service.js';

/** Synthetic durable transport fixtures only; no live Switch or human rehearsal. */
const config = syntheticConfig();
const request = '@two-hands-stage TWOHANDS ' + JSON.stringify({ v: 1, type: 'review_request', sceneId: 'synthetic', taskId: 'task-review', baseRevisionId: null, generation: 0, round: 0, proposalIds: ['candidate'] });
const outbox: OutboxRow = { id: 'task-review', role: 'writer', content: request, status: 'pending' };
const row = (role: 'writer' | 'stage', event: ReturnType<typeof syntheticEvent>): InboxRow => ({ role, content: JSON.stringify(event) });

describe('inspectable Switch collaboration projection', () => {
  it('shows real stored handoffs and account instructions without inventing a repair or rehearsal', () => {
    const store = new Store(config);
    try {
      seedApproved(store);
      const events = store.state().collaboration.events;
      expect(events.map(e => e.kind)).toEqual(expect.arrayContaining(['brief', 'review_request', 'alternatives', 'approval', 'artifacts']));
      expect(events.some(e => e.kind === 'repair_request' || e.kind === 'observation' || e.kind === 'outcome')).toBe(false);
      expect(events.find(e => e.kind === 'review_request')).toMatchObject({ actor: 'writer', to: 'stage', status: 'received' });
      expect(events.find(e => e.kind === 'approval')?.title).toContain('account');
      expect(events.find(e => e.kind === 'artifacts')).toMatchObject({ status: 'pending', timestamp: null });
      expect(JSON.stringify(events)).not.toContain('TWOHANDS');
      expect(store.state().rehearsals).toHaveLength(0);
    } finally { store.close(); }
  });

  it('exposes observation, unconfirmed interpretation, confirmation and repair handoff as distinct recorded steps', () => {
    const store = new Store(config);
    try {
      const original = seedApproved(store);
      ingestHuman(store, `observe ${original.candidate.id} Synthetic difficulty: I need my left hand free.`);
      const job = claimRequired(store, 'stage');
      const observation = store.interpret('stage', job.id, 'Synthetic interpretation: should the left hand remain free?');
      const before = store.state();
      const interpreted = before.collaboration.events.find(e => e.kind === 'interpretation');
      expect(interpreted).toMatchObject({ actor: 'stage', to: 'human', status: 'pending', timestamp: null });
      expect(interpreted?.text).toContain('Unconfirmed interpretation: Synthetic interpretation:');
      expect(before.observations[0]?.text).toBe('Synthetic difficulty: I need my left hand free.');
      expect(before.observations[0]?.status).toBe('awaiting_confirmation');
      expect(before.collaboration.events.some(e => e.kind === 'repair_request')).toBe(false);
      ingestHuman(store, `confirm ${observation.id} left`);
      expect(store.state().collaboration.events.find(e => e.kind === 'repair_request')?.status).toBe('pending');
      relayHandoffs(store, 'stage');
      const after = store.state();
      expect(after.collaboration.events.map(e => e.kind)).toEqual(expect.arrayContaining(['observation', 'interpretation', 'confirmation', 'repair_request']));
      expect(after.collaboration.events.find(e => e.kind === 'repair_request')).toMatchObject({ actor: 'stage', to: 'writer', status: 'received' });
      expect(after.observations[0]?.status).toBe('confirmed');
      expect(after.rehearsals).toEqual([]);
    } finally { store.close(); }
  });

  it('distinguishes pending, acknowledged sends and intended-peer receipts; own echoes are insufficient', () => {
    const echo = syntheticEvent(config, request, { sender: config.writerParticipantId, bridgeId: null });
    const pending = projectCollaboration(config, [], [outbox], new Map()).events[0];
    expect(pending).toMatchObject({ status: 'pending', timestamp: null, messageId: null });
    const sent = projectCollaboration(config, [row('writer', echo)], [{ ...outbox, status: 'sent' }], new Map()).events[0];
    expect(sent).toMatchObject({ status: 'sent', timestamp: null });
    const received = projectCollaboration(config, [row('stage', echo)], [outbox], new Map()).events[0];
    expect(received).toMatchObject({ status: 'received', timestamp: echo.data.payload.timestamp, messageId: echo.data.payload.message_id });
    expect(projectCollaboration(config, [], [{ ...outbox, status: 'uncertain' }], new Map()).events[0]?.status).toBe('uncertain');
  });

  it('requires exact peer payload and identity and never claims a human read an outgoing message', () => {
    const spoof = syntheticEvent(config, request, { sender: '@unknown', senderName: 'Writer' });
    const changed = syntheticEvent(config, request.replace('candidate', 'different'), { sender: config.writerParticipantId });
    for (const event of [spoof, changed]) expect(projectCollaboration(config, [row('stage', event)], [{ ...outbox, status: 'sent' }], new Map()).events[0]?.status).toBe('sent');
    const notice = { id: 'artifacts', role: 'stage' as const, content: 'Approved rev-fixture\nDigest: synthetic\nOffline cue player: http://example.invalid', status: 'sent' };
    const observed = syntheticEvent(config, notice.content, { sender: config.stageParticipantId });
    expect(projectCollaboration(config, [row('writer', observed)], [notice], new Map()).events[0]).toMatchObject({ to: 'human', status: 'sent', messageId: observed.data.payload.message_id });
  });

  it('deduplicates human messages, rejects ambiguous origin and marks edited authority withdrawn', () => {
    const store = new Store(config);
    try {
      const { event } = ingestHuman(store, 'retry-draft', 'writer'); // Rejected instruction remains a received message, never an applied approval.
      store.ingest('stage', event);
      expect(store.state().collaboration.events.filter(e => e.kind === 'retry')).toHaveLength(1);
      const changed = structuredClone(event); changed.id += 1; changed.data.sequence = changed.id; changed.data.payload.body = '@two-hands-writer retry-draft changed';
      store.ingest('writer', changed);
      expect(store.state().collaboration.events.find(e => e.kind === 'retry')?.status).toBe('withdrawn');
      const ambiguous = syntheticEvent(config, 'approve candidate revision digest', { sender: '@unverified', senderName: 'Performer' });
      expect(projectCollaboration(config, [row('stage', ambiguous)], [], new Map([[config.roomId + ':' + ambiguous.data.payload.message_id, false]])).events).toEqual([]);
      const wrongBridge = syntheticEvent(config, 'approve candidate revision digest', { bridgeId: null });
      expect(projectCollaboration(config, [row('stage', wrongBridge)], [], new Map([[config.roomId + ':' + wrongBridge.data.payload.message_id, false]])).events).toEqual([]);
    } finally { store.close(); }
  });

  it('keeps edited peer receipts withdrawn and bounds historical unknown-time sends', () => {
    const receipt = syntheticEvent(config, request, { sender: config.writerParticipantId, bridgeId: null });
    const invalidated = new Map([[config.roomId + ':' + receipt.data.payload.message_id, true]]);
    expect(projectCollaboration(config, [row('stage', receipt)], [outbox], invalidated).events[0]?.status).toBe('withdrawn');
    const many = Array.from({ length: 240 }, (_, index) => ({ ...outbox, id: 'bounded-' + index, status: 'sent' }));
    const result = projectCollaboration(config, [], many, new Map()).events;
    expect(result).toHaveLength(200);
    expect(result.every(event => event.timestamp === null && event.messageId === null && event.status === 'sent')).toBe(true);
  });

  it('omits diagnostics, unknown outbox text, wrong rooms and malformed envelopes', () => {
    const diagnostic = syntheticEvent(config, 'transport nonce diagnostic');
    const wrongRoom = syntheticEvent(config, 'outcome rev success fabricated', { roomId: 'another-room' });
    const result = projectCollaboration(config, [row('writer', diagnostic), row('stage', wrongRoom), { role: 'stage', content: '{broken' }], [{ ...outbox, content: 'unrelated diagnostic secret-like text' }], new Map());
    expect(result.events).toEqual([]);
  });
});
