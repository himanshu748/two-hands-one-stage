import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalize, type Beat } from '@two-hands/domain';
import { Store, digest } from '../../apps/api/src/store.js';
import { createServer } from '../../apps/api/src/server.js';
import { syntheticRevision } from '../../fixtures/scene.js';
import { syntheticConfig, syntheticTokens, syntheticEvent, ingestHuman, seedEligible, seedApproved, claimRequired, relayHandoffs } from '../../fixtures/service.js';

const stores: Store[] = [];
const temporaryDirectories: string[] = [];
function memoryStore() { const store = new Store(syntheticConfig()); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) if (store.db.open) store.close(); for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function tableCount(store: Store, table: 'revisions' | 'approvals' | 'inbox') { return (store.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count; }
function observeAndConfirm(store: Store) {
  const revision = store.current(); if (!revision) throw new Error('Setup needs approved scene');
  ingestHuman(store, `observe ${revision.id} My left hand needs to remain free while I perform.`);
  const job = claimRequired(store, 'stage');
  const observation = store.interpret('stage', job.id, 'Confirm whether the left hand must remain free throughout.');
  ingestHuman(store, `confirm ${observation.id} left`);
  relayHandoffs(store, 'stage');
  return claimRequired(store, 'writer');
}
function leftFreePatch(store: Store): { beats: Beat[] } {
  const base = store.current()!;
  return { beats: [
    { ...base.beats[0]!, actions: [{ type: 'pause', seconds: 2 }] },
    { ...base.beats[2]!, actions: [{ type: 'move', propId: 'p1', hand: 'right', from: 'table', to: 'rest' }] },
  ] };
}

describe('synthetic Switch-shaped service lifecycle', () => {
  it('creates through writer → Switch outbox → stage → exact human approval, with rehearsal still pending', () => {
    const store = memoryStore();
    const proposal = seedApproved(store);
    expect(proposal.status).toBe('committed');
    expect(store.current()?.id).toBe(proposal.candidate.id);
    expect(store.state().currentDigest).toBe(proposal.digest);
    expect(store.state().jobs.map((job) => [job.kind, job.status])).toEqual([['create', 'done'], ['review', 'done']]);
    expect(store.state().rehearsals).toEqual([]);
    expect(store.state().synthetic).toBe(true);
    expect(tableCount(store, 'approvals')).toBe(1);
  });

  it.each(['candidate', 'digest'])('rejects approval naming the wrong %s', (wrong) => {
    const store = memoryStore(); const proposal = seedEligible(store);
    const result = ingestHuman(store, `approve ${proposal.id} ${wrong === 'candidate' ? 'wrong-revision' : proposal.candidate.id} ${wrong === 'digest' ? '0'.repeat(64) : proposal.digest}`).result;
    expect(result).toMatchObject({ rejected: true });
    expect(store.current()).toBeNull(); expect(tableCount(store, 'approvals')).toBe(0);
    expect(store.proposal(proposal.id).status).toBe('eligible');
  });

  it.each(['agent', 'display-name', 'wrong-bridge', 'unmapped-human'])('refuses %s approval origin', (origin) => {
    const store = memoryStore(); const proposal = seedEligible(store);
    const event = syntheticEvent(store.config, `@two-hands-stage approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`, {
      sender: origin === 'agent' ? store.config.writerParticipantId : origin === 'display-name' || origin === 'unmapped-human' ? '@someone-else:switch.invalid' : store.config.identity!.participantId,
      senderName: 'Synthetic performer', bridgeId: origin === 'wrong-bridge' ? 'another-bridge' : store.config.identity!.bridgeId,
    });
    store.ingest('stage', event);
    expect(store.current()).toBeNull(); expect(tableCount(store, 'approvals')).toBe(0);
  });

  it('ignores human approval when only the wrong worker is addressed', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`, 'writer');
    expect(store.current()).toBeNull();
  });

  it('deduplicates both replayed sequence and replayed logical message at a new sequence', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    const { event } = ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`);
    expect(store.ingest('stage', event)).toMatchObject({ duplicate: true });
    expect(store.ingest('stage', { ...event, id: event.id + 100_000, data: { ...event.data, sequence: event.id + 100_000 } })).toMatchObject({ duplicate: true });
    expect(tableCount(store, 'approvals')).toBe(1); expect(tableCount(store, 'revisions')).toBe(1);
    const artifactNotifications = store.db.prepare("SELECT count(*) AS count FROM outbox WHERE content LIKE 'Approved %'").get() as { count: number };
    expect(artifactNotifications.count).toBe(1);
  });

  it('does not create stage review work until the actual stored handoff is received through ingestion', () => {
    const store = memoryStore(); const { id: _id, parentRevisionId: _parent, initialState: _state, constraints: _constraints, beats: _beats, ...brief } = syntheticRevision;
    void _id; void _parent; void _state; void _constraints; void _beats;
    ingestHuman(store, `brief ${JSON.stringify(brief)}`);
    const job = claimRequired(store, 'writer');
    store.createProposals('writer', job.id, [{ candidate: syntheticRevision, artisticCosts: ['Quiet pacing.'] }]);
    expect(store.claim('stage')).toBeNull();
    relayHandoffs(store, 'writer');
    expect(store.claim('stage')?.kind).toBe('review');
  });

  it('preserves an original observation separately, requiring confirmation before constraint and repair work', () => {
    const store = memoryStore(); seedApproved(store);
    const original = 'The paper boat is awkward in my left hand.';
    ingestHuman(store, `observe ${store.current()!.id} ${original}`);
    expect(store.state().constraints).toEqual([]);
    expect(store.claim('writer')).toBeNull();
    const job = claimRequired(store, 'stage');
    const observation = store.interpret('stage', job.id, 'Does keeping the left hand free throughout accurately describe the difficulty?');
    expect(observation.text).toBe(original); expect(observation.status).toBe('awaiting_confirmation');
    expect(store.state().constraints).toEqual([]); expect(store.claim('writer')).toBeNull();
    ingestHuman(store, `confirm ${observation.id} left`);
    expect(store.state().observations[0]?.text).toBe(original);
    expect(store.state().constraints[0]?.unavailableHand).toBe('left');
    expect(store.claim('writer')).toBeNull(); // the engineer-to-writer message has not traversed ingestion yet
    relayHandoffs(store, 'stage');
    expect(store.claim('writer')?.kind).toBe('repair');
  });

  it('repairs a confirmed constraint, exposes artistic alternatives, and commits only the exact chosen revision', () => {
    const store = memoryStore(); const original = seedApproved(store);
    const job = observeAndConfirm(store); const base = store.current()!;
    const secondPatch = { beats: [
      { ...base.beats[0]!, actions: [{ type: 'move' as const, propId: 'p1', hand: 'right' as const, from: 'table' as const, to: 'rest' as const }, { type: 'pause' as const, seconds: 2 }] },
      { ...base.beats[2]!, actions: [{ type: 'pause' as const, seconds: 2 }] },
    ] };
    const proposals = store.createProposals('writer', job.id, [
      { patch: leftFreePatch(store), artisticCosts: ['The boat waits on the table during the opening.'] },
      { patch: secondPatch, artisticCosts: ['The boat arrives before the lighthouse is made.'] },
    ]);
    expect(proposals.every((proposal) => proposal.validation.valid)).toBe(true);
    relayHandoffs(store, 'writer'); const review = claimRequired(store, 'stage');
    store.review('stage', review.id, proposals.map((proposal) => ({ proposalId: proposal.id, explanation: 'All left-hand actions are removed; only a real rehearsal can verify comfort.' })));
    const chosen = store.proposal(proposals[1]!.id);
    expect(ingestHuman(store, `approve ${chosen.id} ${chosen.candidate.id} ${chosen.digest}`).result).toMatchObject({ accepted: true });
    expect(store.current()?.id).toBe(chosen.candidate.id);
    expect(store.proposal(proposals[0]!.id).status).toBe('invalidated');
    expect(store.artifact(original.candidate.id).digest).toBe(original.digest);
    expect(store.state().artifacts).toHaveLength(2);
    expect(store.state().rehearsals).toEqual([]);
    expect(canonicalize(chosen.candidate.beats[1])).toBe(canonicalize(base.beats[1]));
    expect(chosen.candidate.protectedFact).toBe(base.protectedFact);
  });

  it('rejects more than three repair alternatives without a partial proposal write', () => {
    const store = memoryStore(); seedApproved(store); const job = observeAndConfirm(store);
    expect(() => store.createProposals('writer', job.id, Array.from({ length: 4 }, () => ({ patch: leftFreePatch(store), artisticCosts: ['Synthetic alternative.'] })))).toThrow();
    expect(store.state().proposals).toHaveLength(1);
  });

  it('cannot create a scene without a reviewed identity mapping', () => {
    const config = syntheticConfig(); config.identity = null;
    const store = new Store(config); stores.push(store);
    store.ingest('writer', syntheticEvent(config, 'brief {}', { sender: '@synthetic-performer:switch.invalid', bridgeId: 'synthetic-mattermost-bridge' }));
    expect(store.state().brief).toBeNull(); expect(store.state().jobs).toEqual([]);
  });

  it('invalidates outstanding alternatives when another genuine observation changes the constraint state', () => {
    const store = memoryStore(); seedApproved(store);
    const job = observeAndConfirm(store);
    const proposals = store.createProposals('writer', job.id, [{ patch: leftFreePatch(store), artisticCosts: ['The boat stays on the table during the first line.'] }]);
    relayHandoffs(store, 'writer'); const review = claimRequired(store, 'stage');
    store.review('stage', review.id, [{ proposalId: proposals[0]!.id, explanation: 'No left-hand action remains.' }]);
    expect(store.proposal(proposals[0]!.id).status).toBe('eligible');
    const current = store.current()!.id;
    ingestHuman(store, `observe ${current} The cup placement also needs discussion.`);
    const proposal = store.proposal(proposals[0]!.id);
    expect(proposal.status).toBe('invalidated');
    expect(ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`).result).toMatchObject({ rejected: true });
    expect(store.current()!.id).toBe(current);
  });

  it('rejects a stale job base after another revision has been approved', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    store.enqueue('synthetic-stale-job', 'writer', 'create', {});
    ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`);
    const stale = claimRequired(store, 'writer');
    expect(() => store.createProposals('writer', stale.id, [{ candidate: syntheticRevision, artisticCosts: ['Old snapshot.'] }])).toThrow('Job base or constraints changed');
    expect(store.current()!.id).toBe(proposal.candidate.id);
  });

  it('checks stale proposal base inside approval even if other eligibility fields look current', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    proposal.baseRevisionId = 'non-current-base'; store.saveProposal(proposal);
    expect(ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`).result).toMatchObject({ rejected: true });
    expect(store.current()).toBeNull(); expect(tableCount(store, 'approvals')).toBe(0);
  });

  it('rejects a locally plausible patch that breaks later unchanged staging and preserves other beats', () => {
    const store = memoryStore(); seedApproved(store);
    // Enqueue only synthetic service work to isolate full-scene validation, without inventing human evidence.
    store.enqueue('synthetic-validation-job', 'writer', 'repair', {}); const job = claimRequired(store, 'writer');
    const base = store.current()!;
    const replacement: Beat = { ...base.beats[1]!, actions: [{ type: 'move', propId: 'p2', hand: 'right', from: 'table', to: 'table' }] };
    const proposal = store.createProposals('writer', job.id, [{ patch: { beats: [replacement] }, artisticCosts: ['The cup no longer becomes a distant lighthouse.'] }])[0]!;
    expect(proposal.status).toBe('rejected');
    expect(proposal.validation.issues).toContainEqual(expect.objectContaining({ beatId: 'b5', code: 'precondition_location' }));
    expect(proposal.validation.issues.some((issue) => issue.beatId === 'b2')).toBe(false);
    expect(proposal.affectedBeats).toEqual(['b2']);
    expect(canonicalize(proposal.candidate.beats[4])).toBe(canonicalize(base.beats[4]));
    expect(proposal.diff.map((diff) => diff.beatId)).toEqual(['b2']);
  });

  it('revalidates the whole candidate inside approval even if saved validation says valid', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    proposal.candidate.beats[1]!.actions = [{ type: 'hold', propId: 'p2', hand: 'left', from: 'table' }];
    proposal.digest = digest(proposal.candidate); store.saveProposal(proposal);
    expect(ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`).result).toMatchObject({ rejected: true });
    expect(store.current()).toBeNull(); expect(tableCount(store, 'approvals')).toBe(0);
  });

  it('links outcomes to immutable approved content and marks fixture outcomes synthetic', () => {
    const store = memoryStore(); const proposal = seedApproved(store);
    ingestHuman(store, `outcome ${proposal.candidate.id} success Synthetic test outcome, no real person performed this.`);
    expect(store.state().rehearsals[0]).toMatchObject({ revisionId: proposal.candidate.id, source: 'synthetic', outcome: 'success' });
    expect(store.state().currentDigest).toBe(proposal.digest);
    expect(ingestHuman(store, 'outcome unknown success Not a real outcome.').result).toMatchObject({ rejected: true });
  });

  it('revokes an approval explicitly without rewriting historical approved content', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    const { event } = ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`);
    ingestHuman(store, `revoke ${event.data.payload.message_id}`);
    expect(store.current()?.id).toBe(proposal.candidate.id);
    expect(store.db.prepare('SELECT revoked FROM approvals').get()).toEqual({ revoked: 1 });
    expect(ingestHuman(store, `outcome ${proposal.candidate.id} success Should not be recorded.`).result).toMatchObject({ rejected: true });
  });
});

describe('durability and bounded work', () => {
  it('recovers an unfinished job after its lease while retaining its model budget', () => {
    const directory = mkdtempSync(join(tmpdir(), 'two-hands-service-')); temporaryDirectories.push(directory);
    const config = syntheticConfig(join(directory, 'demo.sqlite'));
    const first = new Store(config); stores.push(first);
    first.enqueue('synthetic-interrupted', 'writer', 'create', {});
    const claimed = claimRequired(first, 'writer'); first.modelAttempt('writer', claimed.id); first.close();
    const restarted = new Store(config); stores.push(restarted);
    expect(restarted.claim('writer')).toBeNull();
    restarted.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run(claimed.id);
    const recovered = claimRequired(restarted, 'writer');
    expect(recovered.id).toBe(claimed.id); expect(recovered.model_attempts).toBe(1);
    restarted.modelAttempt('writer', recovered.id);
    expect(() => restarted.modelAttempt('writer', recovered.id)).toThrow('Model attempt budget exhausted');
    expect(restarted.state().jobs[0]?.model_attempts).toBe(2);
  });

  it('atomically persists proposal results, review handoff and job completion across restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'two-hands-result-')); temporaryDirectories.push(directory);
    const config = syntheticConfig(join(directory, 'demo.sqlite'));
    const first = new Store(config); stores.push(first);
    const eligible = seedEligible(first); first.close();
    const restarted = new Store(config); stores.push(restarted);
    expect(restarted.proposal(eligible.id).status).toBe('eligible');
    expect(restarted.state().jobs.every((job) => job.status === 'done')).toBe(true);
    expect(restarted.claim('writer')).toBeNull(); expect(restarted.claim('stage')).toBeNull();
    for (const job of restarted.state().jobs) expect(() => restarted.complete(job.role, job.id)).not.toThrow();
    expect(restarted.state().proposals).toHaveLength(1);
  });

  it('marks interrupted outbox delivery uncertain instead of silently duplicating it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'two-hands-outbox-')); temporaryDirectories.push(directory);
    const config = syntheticConfig(join(directory, 'demo.sqlite'));
    const first = new Store(config); stores.push(first);
    first.notify('synthetic-notification', 'stage', 'Synthetic delivery test');
    expect(first.nextOutbox('stage')?.id).toBe('synthetic-notification'); first.close();
    const restarted = new Store(config); stores.push(restarted);
    expect(restarted.nextOutbox('stage')).toBeNull();
    expect(restarted.db.prepare('SELECT status FROM outbox WHERE id=?').get('synthetic-notification')).toEqual({ status: 'uncertain' });
  });

  it('bounds crash recovery claims and makes blocked state visible', () => {
    const store = memoryStore(); store.enqueue('synthetic-repeat-crash', 'writer', 'create', {});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(store.claim('writer')).not.toBeNull();
      store.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run('synthetic-repeat-crash');
    }
    expect(store.claim('writer')).toBeNull();
    expect(store.state().jobs[0]).toMatchObject({ status: 'blocked', attempts: 3 });
  });
});

describe('local HTTP boundaries and artifact identity', () => {
  it('requires worker auth, enforces role ownership and provides no browser approval route', async () => {
    const store = memoryStore(); const app = createServer(store, syntheticTokens);
    try {
      expect((await app.inject({ method: 'GET', url: '/internal/state' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/internal/state', headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/approve', payload: {} })).statusCode).toBe(404);
      store.set('connection:stage', { status: 'connected', updatedAt: Date.now() });
      store.enqueue('synthetic-writer-only', 'writer', 'create', {}); claimRequired(store, 'writer');
      expect((await app.inject({ method: 'POST', url: '/internal/jobs/synthetic-writer-only/model-attempt', headers: { authorization: `Bearer ${syntheticTokens.stage}` }, payload: {} })).statusCode).toBe(409);
      expect(store.state().jobs[0]?.model_attempts).toBe(0);
    } finally { await app.close(); }
  });

  it('blocks worker advancement until a fresh Switch connection has been reported', async () => {
    const store = memoryStore(); const app = createServer(store, syntheticTokens);
    const headers = { authorization: `Bearer ${syntheticTokens.writer}` };
    try {
      store.enqueue('synthetic-pending', 'writer', 'create', {});
      expect((await app.inject({ method: 'POST', url: '/internal/jobs/claim', headers, payload: {} })).statusCode).toBe(409);
      store.set('connection:writer', { status: 'connected', updatedAt: Date.now() - 20_000 });
      expect((await app.inject({ method: 'POST', url: '/internal/jobs/claim', headers, payload: {} })).statusCode).toBe(409);
      store.set('connection:writer', { status: 'connected', updatedAt: Date.now() });
      const response = await app.inject({ method: 'POST', url: '/internal/jobs/claim', headers, payload: {} });
      expect(response.statusCode).toBe(200); expect(response.json<{ id: string }>().id).toBe('synthetic-pending');
    } finally { await app.close(); }
  });

  it('rejects foreign hosts and origins and malformed event envelopes', async () => {
    const store = memoryStore(); const app = createServer(store, syntheticTokens);
    try {
      expect((await app.inject({ method: 'GET', url: '/api/state', headers: { host: 'evil.example' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/state', headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/internal/events', headers: { authorization: `Bearer ${syntheticTokens.stage}` }, payload: { event: 'message' } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });

  it('serves both HTML outputs from the same immutable approved revision and digest', async () => {
    const store = memoryStore(); const proposal = seedApproved(store); const app = createServer(store, syntheticTokens);
    try {
      const artifact = store.state().artifacts[0]!;
      expect(artifact.revisionId).toBe(proposal.candidate.id); expect(artifact.digest).toBe(proposal.digest);
      const cue = await app.inject({ method: 'GET', url: artifact.cueUrl });
      const script = await app.inject({ method: 'GET', url: artifact.scriptUrl });
      expect(cue.statusCode).toBe(200); expect(script.statusCode).toBe(200);
      for (const response of [cue, script]) {
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.body).toContain(proposal.candidate.id); expect(response.body).toContain(proposal.digest);
        expect(response.body).toContain('Synthetic'); expect(response.body).not.toContain(syntheticTokens.writer);
      }
      expect(store.artifact(proposal.candidate.id).revision).toEqual(proposal.candidate);
    } finally { await app.close(); }
  });
});

describe('edited messages', () => {
  it('invalidates a previously accepted instruction even when its edit removes the mention', () => {
    const store = memoryStore(); const proposal = seedEligible(store);
    const { event } = ingestHuman(store, `approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`);
    const edited = syntheticEvent(store.config, 'Withdrawn approval', { messageId: event.data.payload.message_id, addressed: false });
    store.ingest('stage', edited);
    expect(store.db.prepare('SELECT revoked FROM approvals').get()).toEqual({ revoked: 1 });
    expect(store.get('hold', false)).toBe(true);
    expect(store.current()!.id).toBe(proposal.candidate.id);
  });
});
