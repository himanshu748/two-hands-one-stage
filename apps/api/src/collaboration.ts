import { SwitchMessageSchema, type SwitchMessage } from '@two-hands/switch-client';
import { canonicalize, BriefSchema } from '@two-hands/domain';
import type { CollaborationEvent, Role, ServiceConfig } from './types.js';

export interface InboxRow { role: Role; content: string }
export interface OutboxRow { id: string; role: Role; content: string; status: string }
type Description = Pick<CollaborationEvent, 'kind' | 'title' | 'text' | 'to' | 'taskId' | 'revisionId'>;
const stripAddress = (body: string) => body.replace(/^\s*@[^\s]+\s*/, '').trim();
const timestamp = (event: SwitchMessage) => Number.isSafeInteger(event.data.payload.timestamp) && event.data.payload.timestamp > 0 ? event.data.payload.timestamp : null;

function peer(body: string): { type: 'repair_request' | 'review_request'; taskId: string; baseRevisionId: string | null; proposalIds?: string[] } | null {
  const marker = body.indexOf('TWOHANDS ');
  if (marker < 0) return null;
  try {
    const value = JSON.parse(body.slice(marker + 9));
    if (value.v !== 1 || !['repair_request', 'review_request'].includes(value.type) || typeof value.taskId !== 'string' || !(value.baseRevisionId === null || typeof value.baseRevisionId === 'string')) return null;
    return value;
  } catch { return null; }
}
function outgoing(row: OutboxRow): Description | null {
  const request = peer(row.content);
  if (request) return { kind: request.type, title: request.type === 'review_request' ? 'Writer asked for a staging review' : 'Stage engineer requested a repair', text: request.type === 'review_request' ? 'The writer sent the proposed scene to the stage engineer to check hands, object positions and later actions.' : 'The stage engineer asked the writer for changes around the confirmed physical constraint, with artistic tradeoffs.', to: request.type === 'review_request' ? 'stage' : 'writer', taskId: request.taskId, revisionId: request.baseRevisionId };
  const base = { to: 'human' as const, taskId: null, revisionId: null };
  if (row.content.startsWith('Scene alternatives.')) return { ...base, kind: 'alternatives', title: 'Reviewed scene options', text: 'The stage engineer prepared the checks and artistic costs for your decision. The complete options remain available in the scene review.' };
  if (row.content.startsWith('Approved ')) return { ...base, kind: 'artifacts', title: 'Performance file links', text: 'This message contains the approved scene’s cue player and printable script. Physical rehearsal is still a separate step.', revisionId: /^Approved (\S+)/.exec(row.content)?.[1] ?? null };
  if (row.content.startsWith('Your original observation: ')) {
    const start = row.content.indexOf('\nEngineer interpretation (unconfirmed): ');
    const end = row.content.lastIndexOf('\nThe current action model supports');
    const interpretation = start >= 0 && end > start ? row.content.slice(start + '\nEngineer interpretation (unconfirmed): '.length, end).slice(0, 1500) : '';
    return { ...base, kind: 'interpretation', title: 'Stage engineer prepared a constraint for your confirmation', text: interpretation ? `Unconfirmed interpretation: ${interpretation}` : 'The engineer prepared an interpretation of the reported difficulty. It needs explicit confirmation before a repair.' };
  }
  if (/^(Instruction not applied:|Work is blocked|An edited instruction|Stale collaborative request|Interpretation:|Observation |Confirmed |Approval |Rehearsal |Outcome )/.test(row.content)) return { ...base, kind: 'notice', title: row.content.startsWith('Work is blocked') ? 'Blocked work notice' : row.content.startsWith('Instruction not applied:') ? 'The instruction needs attention' : 'Scene status update', text: row.content.startsWith('Work is blocked') ? 'The bounded execution attempts stopped. The earlier work and its failure remain in the record.' : row.content.startsWith('Instruction not applied:') ? 'The application rejected an instruction. Check the room response and current scene before trying again.' : 'A scene or instruction status update is prepared for Switch. Check the delivery status and matching room message for its original wording.' };
  return null;
}
function human(body: string): Description | null {
  const command = stripAddress(body);
  const [verb, first, second] = command.split(/\s+/);
  const base = { to: ['brief', 'retry-draft'].includes(verb ?? '') ? 'writer' as const : 'stage' as const, taskId: null, revisionId: null };
  if (verb === 'brief') {
    try {
      const parsed = BriefSchema.safeParse(JSON.parse(command.slice(6)));
      if (!parsed.success) return null;
      return { ...base, kind: 'brief', title: 'Performer account sent the scene brief', text: `Three props: ${parsed.data.props.map(p => p.name).join(', ')}. Goal: ${parsed.data.emotionalGoal}`.slice(0, 1500) };
    } catch { return null; }
  }
  if (verb === 'observe' && first) return { ...base, kind: 'observation', title: 'Performer account reported a difficulty', text: command.slice(command.indexOf(first) + first.length).trim().slice(0, 1500), revisionId: first };
  if (verb === 'confirm' && first && ['left', 'right'].includes(second ?? '')) return { ...base, kind: 'confirmation', title: 'Performer account sent constraint confirmation', text: `Requested that the ${second} hand remain free. This is a recorded message; the current constraint state shows whether it was applied.` };
  if (verb === 'approve' && first && second) return { ...base, kind: 'approval', title: 'Performer account sent an approval instruction', text: 'The account requested approval of a candidate. The scene approval state records whether its exact revision and digest were accepted, rejected or later withdrawn.', revisionId: second };
  if (verb === 'outcome' && first) return { ...base, kind: 'outcome', title: 'Performer account sent a rehearsal outcome', text: command.slice(command.indexOf(first) + first.length).trim().slice(0, 1500), revisionId: first };
  if (verb === 'retry-draft') return { ...base, kind: 'retry', title: 'Performer account requested another draft', text: 'An explicit request asked the writer to try the preserved brief again. Earlier failed work stays in the record.' };
  if (verb === 'revoke') return { ...base, kind: 'notice', title: 'Performer account sent a revocation', text: 'The performer account asked to withdraw earlier authority. Inspect the current approval and hold state.' };
  return null;
}

/** Read-only projection of recorded transport evidence, never an agent conversation generator. */
export function projectCollaboration(config: ServiceConfig, inboxRows: InboxRow[], outboxRows: OutboxRow[], messages: Map<string, boolean>): { events: CollaborationEvent[] } {
  const inbox = inboxRows.flatMap(row => {
    try { const parsed = SwitchMessageSchema.safeParse(JSON.parse(row.content)); return parsed.success && parsed.data.data.room_id === config.roomId ? [{ role: row.role, event: parsed.data }] : []; } catch { return []; }
  });
  const events: CollaborationEvent[] = [];
  const seen = new Set<string>();
  for (const { role, event } of inbox) {
    const payload = event.data.payload;
    const identity = config.identity;
    const key = config.roomId + ':' + payload.message_id;
    const authorized = identity && identity.roomId === config.roomId && event.data.bridge_id === identity.bridgeId && payload.sender === identity.participantId && ![config.writerParticipantId, config.stageParticipantId].includes(identity.participantId);
    if (!authorized || !payload.addressed || !messages.has(key)) continue;
    const description = human(payload.body);
    if (!description || role !== description.to || seen.has(key)) continue;
    seen.add(key);
    events.push({ id: `message:${key}`, actor: 'human', ...description, status: messages.get(key) ? 'withdrawn' : 'received', timestamp: timestamp(event), messageId: payload.message_id });
  }
  for (const row of outboxRows) {
    const description = outgoing(row);
    if (!description) continue;
    const sender = row.role === 'writer' ? config.writerParticipantId : config.stageParticipantId;
    const request = peer(row.content);
    const receipt = inbox.find(({ role, event }) => {
      if (event.data.payload.sender !== sender) return false;
      if (request) {
        // A self echo is not evidence that the intended peer received the request.
        const received = peer(event.data.payload.body);
        return role === description.to && event.data.payload.addressed && received && canonicalize(received) === canonicalize(request);
      }
      return stripAddress(event.data.payload.body) === stripAddress(row.content);
    })?.event;
    events.push({ id: `delivery:${row.id}`, actor: row.role, ...description, status: receipt && messages.get(config.roomId + ':' + receipt.data.payload.message_id) ? 'withdrawn' : description.to !== 'human' && receipt ? 'received' : row.status === 'sent' ? 'sent' : row.status === 'uncertain' ? 'uncertain' : row.status === 'failed' ? 'failed' : 'pending', timestamp: receipt ? timestamp(receipt) : null, messageId: receipt?.data.payload.message_id ?? null, taskId: description.taskId ?? row.id });
  }
  // Unknown historical send times stay null. Array order puts those entries after timestamped receipts.
  events.sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity));
  return { events: events.slice(-200) };
}
