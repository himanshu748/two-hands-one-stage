import WebSocket from 'ws';
import { z } from 'zod';

const nonempty = z.string().min(1);
// Protocol 9 supplies this even to legacy ticket clients before their first event.
export const ResumePositionSchema = z.record(z.string().regex(/^(s|r:.+)$/), z.number().int().nonnegative().safe()).refine((value) => typeof value.s === 'number' && Object.keys(value).length <= 64);
export type ResumePosition = z.infer<typeof ResumePositionSchema>;
export const SwitchMessageSchema = z.object({
  event: z.literal('message'),
  id: z.number().int().nonnegative(),
  data: z.object({
    type: z.literal('message'), room_id: nonempty,
    bridge_id: z.string().nullable(), channel_type: z.string().nullable(),
    sequence: z.number().int().nonnegative(),
    payload: z.object({
      addressed: z.boolean(), sender: nonempty, sender_name: z.string(),
      message_id: nonempty, body: z.string().max(100_000), timestamp: z.number(),
      thread_id: z.string().nullable().optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough().refine((event) => event.id === event.data.sequence, 'Event id and sequence disagree');
export type SwitchMessage = z.infer<typeof SwitchMessageSchema>;
export type SwitchConfig = {
  baseUrl: string; agentId: string; apiKey: string; roomId: string; connectionId: string;
  cursor?: number; generation?: number; position?: ResumePosition;
};
export type ConnectionState = {
  connectionId: string; cursor: number; generation?: number; position?: ResumePosition; rooms?: string[];
  status: string; server?: unknown;
};
export type SwitchHandlers = {
  onEvent: (event: SwitchMessage) => Promise<void>;
  onState: (state: ConnectionState) => Promise<void> | void;
  onBlocked: (reason: string) => void;
};
const RegistrySchema = z.object({ operations: z.record(z.string(), z.object({
  description: z.string(), input_schema: z.record(z.string(), z.unknown()),
})) });
export type OperationRegistry = z.infer<typeof RegistrySchema>;
const FrameSchema = z.object({ event: z.string(), data: z.record(z.string(), z.unknown()), id: z.number().int().nonnegative().optional() });
const StateSchema = z.object({
  connection_id: nonempty, agent_id: nonempty, cursor: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative(), position: ResumePositionSchema.optional(), rooms: z.array(z.string()), server: z.unknown().optional(),
});

/** Match opaque IDs exactly. This package does not infer human status or approve application actions. */
export class SwitchClient {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private receiveTimer?: ReturnType<typeof setTimeout>;
  private live = false;
  private handlers?: SwitchHandlers;
  private registry?: OperationRegistry;
  private stopped = true;
  private blocked = false;
  private attempts = 0;
  private cursor: number;
  private generation?: number;
  private position?: ResumePosition;
  private hasCheckpoint: boolean;
  private rooms: string[] = [];
  private server: unknown;
  private queue: Promise<void> = Promise.resolve();
  private readonly base: URL;

  constructor(private readonly config: SwitchConfig) {
    this.base = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password || this.base.search || this.base.hash) {
      throw new Error('SWITCH_BASE_URL must be an HTTP(S) bridge base URL without credentials, query, or fragment');
    }
    if (this.base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(this.base.hostname)) {
      throw new Error('Use HTTPS for a non-loopback Switch bridge so bearer credentials are encrypted');
    }
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.length === 0) throw new Error(`Missing Switch configuration: ${key}`);
    }
    this.cursor = config.cursor ?? 0;
    this.hasCheckpoint = config.cursor !== undefined || config.position !== undefined;
    this.generation = config.generation;
    this.position = config.position === undefined ? undefined : ResumePositionSchema.parse(config.position);
    if (this.position && this.position[`r:${config.roomId}`] === undefined) throw new Error('Saved Switch position does not cover the configured room; reconcile history before recovery');
  }

  private url(path: string): URL { return new URL(path, this.base); }
  private agentPath(suffix: string): string { return `agents/${encodeURIComponent(this.config.agentId)}/${suffix}`; }

  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Switch-Connection-Id': this.config.connectionId,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
    } catch { throw new Error('Switch HTTP connection failed or timed out; check bridge URL and runtime'); }
    if (!response.ok) throw new Error(`Switch HTTP ${response.status}; check credentials, membership, and runtime operation schema`);
    const content = await response.text();
    if (content.length > 2_000_000) throw new Error('Switch response exceeded the 2 MB safety limit');
    try { return JSON.parse(content) as unknown; } catch { throw new Error('Switch returned invalid JSON'); }
  }

  async discover(): Promise<OperationRegistry> {
    const parsed = RegistrySchema.safeParse(await this.request(this.agentPath('ops')));
    if (!parsed.success) throw new Error('Switch operation registry has an unsupported shape');
    for (const operation of ['read_context', 'list_participants', 'get_agent_detail']) {
      if (!parsed.data.operations[operation]) throw new Error(`Switch runtime is missing required operation ${operation}`);
    }
    this.registry = parsed.data;
    return parsed.data;
  }

  async operation(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.registry) await this.discover();
    const operation = this.registry?.operations[name];
    if (!operation) throw new Error(`Operation ${name} is not advertised by this Switch runtime`);
    // Check the runtime's argument names; Switch remains authoritative for full signature validation.
    const schema = operation.input_schema;
    const properties = typeof schema.properties === 'object' && schema.properties !== null
      ? schema.properties as Record<string, unknown> : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === 'string' && !(key in args)) throw new Error(`Switch operation ${name} requires ${key}`);
    }
    for (const key of Object.keys(args)) {
      if (!(key in properties)) throw new Error(`Switch operation ${name} does not advertise argument ${key}`);
    }
    const response = await this.request(this.agentPath(`ops/${encodeURIComponent(name)}`), 'POST', args);
    if (typeof response !== 'object' || response === null || !('result' in response)) {
      throw new Error('Switch operation returned an unsupported result envelope');
    }
    return response.result;
  }

  async post(content: string): Promise<unknown> {
    if (!content.trim() || content.length > 100_000) throw new Error('Switch message must contain 1–100000 characters');
    if (this.stopped || this.blocked || this.socket?.readyState !== WebSocket.OPEN || !this.rooms.includes(this.config.roomId)) {
      throw new Error('Switch is not connected to the intended room; outgoing collaboration remains pending');
    }
    return this.request(this.agentPath('message'), 'POST', { room_id: this.config.roomId, content });
  }

  start(handlers: SwitchHandlers): void {
    if (!this.stopped) throw new Error('Switch client is already started');
    this.handlers = handlers;
    this.stopped = false;
    this.blocked = false;
    this.attempts = 0;
    void this.open().catch(() => this.block('Switch startup failed; verify bridge URL, API key, and required operation registry'));
  }

  stop(): void {
    this.stopped = true;
    this.live = false;
    if (this.receiveTimer) clearTimeout(this.receiveTimer);
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
  }

  private state(status: string): ConnectionState {
    return {
      connectionId: this.config.connectionId, cursor: this.cursor, status,
      ...(this.generation === undefined ? {} : { generation: this.generation }),
      ...(this.position === undefined ? {} : { position: { ...this.position } }),
      rooms: this.rooms, ...(this.server === undefined ? {} : { server: this.server }),
    };
  }

  private block(reason: string): void {
    if (this.blocked) return;
    this.blocked = true;
    this.stop();
    void Promise.resolve(this.handlers?.onState(this.state('blocked'))).catch(() => undefined);
    this.handlers?.onBlocked(reason);
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    await this.handlers?.onState(this.state('connecting'));
    if (!this.registry) await this.discover();
    if (this.stopped) return;
    const endpoint = this.url(this.agentPath('connection/ws'));
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    endpoint.searchParams.set('connection_id', this.config.connectionId);
    endpoint.searchParams.set('rooms', this.config.roomId);
    endpoint.searchParams.set('scope', 'single');
    endpoint.searchParams.set('filter', 'all');
    // Legacy filter=all tickets are zero until an event arrives. Preserve the
    // server's complete starting position instead of replaying from numeric zero.
    if (this.cursor === 0 && this.position !== undefined) {
      endpoint.searchParams.set('start_at', JSON.stringify(this.position));
    } else {
      endpoint.searchParams.set('start_from', this.config.cursor === undefined && this.generation === undefined ? 'head' : String(this.cursor));
    }
    if (this.generation !== undefined) endpoint.searchParams.set('expected_generation', String(this.generation));
    endpoint.searchParams.set('client', 'two-hands-one-stage');
    endpoint.searchParams.set('client_version', '0.1.0');
    const socket = new WebSocket(endpoint, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      handshakeTimeout: 15_000, maxPayload: 1_000_000,
    });
    this.socket = socket;
    // Official protocol: ping every 2s, liveness lapses after 6s. TCP alone
    // cannot detect a partition; local API heartbeats must not mask it.
    const watchReceive = () => {
      if (this.stopped || socket !== this.socket) return;
      if (this.receiveTimer) clearTimeout(this.receiveTimer);
      this.receiveTimer = setTimeout(() => {
        if (this.stopped || socket !== this.socket) return;
        this.live = false;
        this.rooms = [];
        void Promise.resolve(this.handlers?.onState(this.state('disconnected')))
          .catch(() => this.block('Unable to persist disconnected status'));
        socket.terminate();
      }, 6000);
    };
    socket.on('open', watchReceive);
    socket.on('message', (data) => {
      if (this.stopped || socket !== this.socket) return;
      let raw: unknown;
      try { raw = JSON.parse(data.toString()) as unknown; } catch { this.block('Switch sent malformed JSON; no event was acknowledged'); return; }
      const frame = FrameSchema.safeParse(raw);
      if (!frame.success) { this.block('Switch sent an unsupported frame; no event was acknowledged'); return; }
      watchReceive();
      if (frame.data.event === 'ping') {
        // Never put liveness behind model calls or durable ingestion.
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'pong', cursor: this.cursor }));
        return;
      }
      this.queue = this.queue.then(async () => {
        if (this.stopped || socket !== this.socket) return;
        await this.handleFrame(frame.data, raw);
      }).catch(() => this.block('Durable event processing failed; restart after repairing storage to replay from the saved cursor'));
    });
    socket.on('error', () => { /* close handles bounded recovery; never log URL or credentials */ });
    socket.on('close', (code) => {
      if (this.stopped || socket !== this.socket) return;
      this.live = false;
      this.rooms = [];
      if (this.receiveTimer) clearTimeout(this.receiveTimer);
      if ([4400, 4401, 4403, 4409].includes(code)) {
        this.block(`Switch refused connection (${code}); fix configuration or takeover before restarting`);
        return;
      }
      // Stop creative work immediately; drain receipts only to choose the resume cursor.
      const disconnected = Promise.resolve(this.handlers?.onState(this.state('disconnected')));
      void Promise.all([this.queue, disconnected]).then(async () => {
        if (this.stopped || socket !== this.socket) return;
        this.attempts += 1;
        if (this.attempts > 8) { this.block('Switch reconnect budget exhausted after 8 retries; check the runtime and restart the worker'); return; }
        const delay = Math.min(30_000, 500 * 2 ** (this.attempts - 1)) + Math.floor(Math.random() * 250);
        this.timer = setTimeout(() => { void this.open().catch(() => this.block('Switch reconnect failed during startup checks')); }, delay);
      }).catch(() => this.block('Unable to persist disconnected status'));
    });
  }

  private async handleFrame(frame: z.infer<typeof FrameSchema>, raw: unknown): Promise<void> {
    if (frame.event === 'connection_state') {
      const state = StateSchema.parse(frame.data);
      if (state.connection_id !== this.config.connectionId || state.agent_id !== this.config.agentId || !state.rooms.includes(this.config.roomId)) {
        this.block('Switch connection state does not cover the configured agent and room'); return;
      }
      if (state.position && state.position[`r:${this.config.roomId}`] === undefined) {
        this.block('Switch position does not cover the configured room'); return;
      }
      // A reconnect can send a fallback head before its gap frame. Never
      // replace a committed checkpoint before that gap can be persisted.
      if (!this.hasCheckpoint) {
        this.cursor = state.cursor;
        this.position = state.position;
        this.hasCheckpoint = true;
      }
      this.generation = state.generation;
      this.live = this.socket?.readyState === WebSocket.OPEN;
      this.rooms = this.live ? state.rooms : [];
      this.server = state.server;
      await this.handlers?.onState(this.state(this.live ? 'connected' : 'disconnected'));
      return;
    }
    if (frame.event === 'gap') {
      this.block('Switch replay gap: collaboration blocked. Reconcile room history with read_context and outstanding approvals before resetting the cursor'); return;
    }
    if (frame.event === 'refused') { this.block('Switch refused the connection; inspect membership and protocol compatibility'); return; }
    if (frame.event === 'evicted') {
      if (['heartbeat_lapsed', 'no_stream', 'unfenced', 'connection_error'].includes(String(frame.data.code))) {
        this.socket?.close();
      } else { this.block(`Switch connection evicted (${String(frame.data.code)}); automatic takeover is disabled`); }
      return;
    }
    if (frame.event === 'subscription_changed' || frame.event === 'room_released') {
      const rooms = frame.data.rooms;
      if (frame.event === 'room_released' || !Array.isArray(rooms) || !rooms.includes(this.config.roomId)) {
        this.block('Switch room claim was released; another session may own it');
      }
      return;
    }
    if (!['message', 'command', 'room_join'].includes(frame.event) || frame.id === undefined) {
      this.block('Unknown Switch event kind; no event was acknowledged'); return;
    }
    if (frame.id <= this.cursor) return;
    if (frame.event === 'message') {
      const event = SwitchMessageSchema.parse(raw);
      if (event.data.room_id !== this.config.roomId) { this.block('Switch delivered an event outside the configured room'); return; }
      await this.handlers?.onEvent(event);
    }
    // The callback commits the API inbox first. A crash before this checkpoint only causes a safe replay.
    const nextCursor = frame.id;
    const checkpoint = { ...this.state(this.live ? 'connected' : 'disconnected'), cursor: nextCursor };
    await this.handlers?.onState(checkpoint);
    this.cursor = nextCursor;
  }
}

export function sanitizedEnvelope(event: SwitchMessage): unknown {
  return {
    event: event.event, id: event.id,
    data: { type: event.data.type, room_id: '<room>', bridge_id: event.data.bridge_id === null ? null : '<bridge>',
      channel_type: event.data.channel_type, sequence: event.data.sequence,
      payload: { addressed: event.data.payload.addressed, sender: '<opaque-participant-id>', sender_name: '<redacted>',
        message_id: '<stable-message-id>', body: '<redacted>', timestamp: event.data.payload.timestamp,
        thread_id: event.data.payload.thread_id ? '<thread>' : null } },
  };
}
