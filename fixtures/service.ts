import type { SwitchMessage } from '@two-hands/switch-client';
import { Store } from '../apps/api/src/store.js';
import type { ServiceConfig, Proposal, Role, Job } from '../apps/api/src/types.js';
import { syntheticRevision } from './scene.js';

/** All helpers in this file are synthetic service fixtures, never live Switch evidence. */
export const syntheticTokens = { writer: 'synthetic-writer-token-00000000000000000000', stage: 'synthetic-stage-token-000000000000000000000' };
export function syntheticConfig(databasePath = ':memory:'): ServiceConfig {
  return {
    databasePath, roomId: '!synthetic-room:switch.invalid', writerName: 'two-hands-writer', stageName: 'two-hands-stage',
    writerParticipantId: '@synthetic-writer:switch.invalid', stageParticipantId: '@synthetic-stage:switch.invalid',
    identity: { roomId: '!synthetic-room:switch.invalid', bridgeId: 'synthetic-mattermost-bridge', participantId: '@synthetic-performer:switch.invalid', mattermostUserId: 'synthetic-human-user', mattermostChannelId: 'synthetic-channel', verifiedAt: '2026-11-04T00:00:00.000Z', evidence: 'Synthetic unit/service fixture only. No live identity mapping was verified.' },
    publicUrl: 'http://127.0.0.1:5173', synthetic: true,
  };
}
let sequence = 1000;
export function syntheticEvent(config: ServiceConfig, body: string, options: {
  sender?: string; senderName?: string; messageId?: string; sequence?: number; addressed?: boolean;
  bridgeId?: string | null; roomId?: string;
} = {}): SwitchMessage {
  const id = options.sequence ?? ++sequence;
  return {
    event: 'message', id,
    data: { type: 'message', room_id: options.roomId ?? config.roomId, bridge_id: options.bridgeId === undefined ? config.identity?.bridgeId ?? null : options.bridgeId, channel_type: 'channel_public', sequence: id,
      payload: { addressed: options.addressed ?? true, sender: options.sender ?? config.identity?.participantId ?? '@unverified:switch.invalid', sender_name: options.senderName ?? 'Synthetic performer', message_id: options.messageId ?? `$synthetic-message-${id}`, body, timestamp: Date.UTC(2026, 10, 4) + id, thread_id: null } },
  };
}
export function ingestHuman(store: Store, body: string, role: Role = body.startsWith('brief ') ? 'writer' : 'stage', options: Parameters<typeof syntheticEvent>[2] = {}) {
  const event = syntheticEvent(store.config, `@${role === 'writer' ? store.config.writerName : store.config.stageName} ${body}`, options);
  return { event, result: store.ingest(role, event) };
}
export function claimRequired(store: Store, role: Role): Job {
  const job = store.claim(role); if (!job) throw new Error(`Synthetic setup expected a ${role} job`); return job;
}

/** Deliver only messages actually produced by the durable outbox. Transport is explicitly synthetic. */
export function relayHandoffs(store: Store, from: Role): number {
  let deliveries = 0;
  for (let guard = 0; guard < 30; guard += 1) {
    const outgoing = store.nextOutbox(from); if (!outgoing) return deliveries;
    store.outboxResult(from, outgoing.id, true);
    if (outgoing.content.includes('TWOHANDS ')) {
      const to = from === 'writer' ? 'stage' : 'writer';
      store.ingest(to, syntheticEvent(store.config, outgoing.content, { sender: from === 'writer' ? store.config.writerParticipantId : store.config.stageParticipantId, bridgeId: null, senderName: `Synthetic ${from}`, messageId: `$synthetic-outbox-${outgoing.id}` }));
      deliveries += 1;
    }
  }
  throw new Error('Synthetic outbox guard exceeded');
}
export function seedEligible(store: Store): Proposal {
  const { id: _id, parentRevisionId: _parent, initialState: _state, constraints: _constraints, beats: _beats, ...brief } = syntheticRevision;
  void _id; void _parent; void _state; void _constraints; void _beats;
  ingestHuman(store, `brief ${JSON.stringify(brief)}`);
  const writer = claimRequired(store, 'writer');
  const proposals = store.createProposals('writer', writer.id, [{ candidate: syntheticRevision, artisticCosts: ['A quiet pace gives the waiting room to breathe.'] }]);
  if (relayHandoffs(store, 'writer') !== 1) throw new Error('Synthetic setup expected a Switch-shaped writer review request');
  const stage = claimRequired(store, 'stage');
  store.review('stage', stage.id, proposals.map((proposal) => ({ proposalId: proposal.id, explanation: 'Symbolic hand and location checks pass. Human rehearsal is still required.' })));
  return store.proposal(proposals[0]!.id);
}
export function seedApproved(store: Store): Proposal {
  const proposal = seedEligible(store);
  const { result } = ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`);
  if (!('accepted' in result) || !result.accepted) throw new Error('Synthetic approval setup failed');
  return store.proposal(proposal.id);
}
