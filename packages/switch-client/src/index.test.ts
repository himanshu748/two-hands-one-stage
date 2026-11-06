import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { SwitchClient, SwitchMessageSchema, type ConnectionState, type SwitchMessage, type SwitchConfig } from './index.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const syntheticMessage = (id = 1): SwitchMessage => ({
  event: 'message', id, data: { type: 'message', room_id: 'synthetic-room', bridge_id: 'synthetic-bridge',
    channel_type: 'channel_public', sequence: id, payload: { addressed: true, sender: '@opaque-performer:fixture',
      sender_name: 'Synthetic performer', message_id: `synthetic-message-${id}`, body: 'Synthetic transport test only', timestamp: 1 } },
});
async function until(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Fixture transport condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function fixture(options: { position?: Record<string, number>; stateCursor?: number; config?: Partial<SwitchConfig> } = {}) {
  const sockets: WebSocket[] = [];
  const urls: URL[] = [];
  const pongs: unknown[] = [];
  const requests: Array<{ path: string; auth: string | undefined; body: unknown }> = [];
  const server: Server = createServer((request, response) => {
    let content = '';
    request.on('data', (chunk: Buffer) => { content += chunk.toString(); });
    request.on('end', () => {
      requests.push({ path: request.url ?? '', auth: request.headers.authorization, body: content ? JSON.parse(content) as unknown : null });
      response.setHeader('content-type', 'application/json');
      if (request.url?.endsWith('/ops')) response.end(JSON.stringify({ operations: {
        read_context: { description: 'fixture', input_schema: { properties: { limit: { type: 'integer' } } } },
        list_participants: { description: 'fixture', input_schema: { properties: {} } },
        get_agent_detail: { description: 'fixture', input_schema: { properties: { agent_id: { type: 'string' } }, required: ['agent_id'] } },
      } }));
      else response.end(JSON.stringify({ result: { ok: true } }));
    });
  });
  const ws = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    urls.push(new URL(request.url ?? '/', 'http://127.0.0.1'));
    ws.handleUpgrade(request, socket, head, (client) => {
      sockets.push(client);
      client.on('message', (data) => { pongs.push(JSON.parse(data.toString()) as unknown); });
      client.send(JSON.stringify({ event: 'connection_state', data: { connection_id: 'fixture-connection', agent_id: 'fixture-agent',
        rooms: ['synthetic-room'], cursor: options.stateCursor ?? (Number(urls.at(-1)?.searchParams.get('start_from')) || 0),
        generation: sockets.length, ...(options.position ? { position: options.position } : {}), server: { version: 'synthetic-test-only' } } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { for (const socket of sockets) socket.terminate(); ws.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const client = new SwitchClient({ baseUrl, agentId: 'fixture-agent', apiKey: 'synthetic-not-a-secret', roomId: 'synthetic-room', connectionId: 'fixture-connection', ...options.config });
  cleanups.push(async () => { client.stop(); });
  return { client, sockets, urls, pongs, requests };
}

describe('Switch transport — local synthetic protocol fixtures, not a Switch runtime', () => {
  it('rejects inconsistent event identifiers and never infers identity from a display name', () => {
    expect(SwitchMessageSchema.safeParse({ ...syntheticMessage(), id: 2 }).success).toBe(false);
    expect(SwitchMessageSchema.parse(syntheticMessage()).data.payload.sender).toBe('@opaque-performer:fixture');
  });


  it('preserves the complete zero-ticket position across a reconnect before any message arrives', async () => {
    const position = { s: 4294967297, 'r:synthetic-room': 12 };
    const { client, sockets, urls } = await fixture({ position });
    const states: ConnectionState[] = [];
    client.start({ onEvent: async () => undefined, onState: state => { states.push(state); }, onBlocked: reason => { throw new Error(reason); } });
    await until(() => states.at(-1)?.status === 'connected');
    expect(states.at(-1)).toMatchObject({ cursor: 0, position });
    sockets[0]!.close(1012);
    await until(() => sockets.length === 2);
    expect(JSON.parse(urls[1]!.searchParams.get('start_at')!)).toEqual(position);
    expect(urls[1]!.searchParams.has('start_from')).toBe(false);
    expect(urls[1]!.searchParams.get('expected_generation')).toBe('1');
  });

  it('resumes a saved zero-ticket position after process restart but prefers a committed event ticket', async () => {
    const position = { s: 4294967297, 'r:synthetic-room': 12 };
    const { client, sockets, urls } = await fixture({ position, config: { cursor: 0, generation: 7, position } });
    const states: ConnectionState[] = [];
    client.start({ onEvent: async () => undefined, onState: state => { states.push(state); }, onBlocked: reason => { throw new Error(reason); } });
    await until(() => states.at(-1)?.status === 'connected');
    expect(JSON.parse(urls[0]!.searchParams.get('start_at')!)).toEqual(position);
    expect(urls[0]!.searchParams.get('expected_generation')).toBe('7');
    sockets[0]!.send(JSON.stringify(syntheticMessage(123)));
    await until(() => states.at(-1)?.cursor === 123);
    sockets[0]!.close(1012);
    await until(() => sockets.length === 2);
    expect(urls[1]!.searchParams.get('start_from')).toBe('123');
    expect(urls[1]!.searchParams.has('start_at')).toBe(false);
  });

  it.each([
    { cursor: 123, generation: 7 },
    { cursor: 0, generation: 7, position: { s: 100, 'r:synthetic-room': 12 } },
    { cursor: 0, generation: 7 },
  ])('never persists a fallback head before a following gap, even if the connection drops first: %j', async (saved) => {
    const { client, sockets, urls } = await fixture({ stateCursor: 0, position: { s: 900, 'r:synthetic-room': 50 }, config: saved });
    const states: ConnectionState[] = [];
    client.start({ onEvent: async () => undefined, onState: state => { states.push(state); }, onBlocked: reason => { throw new Error(reason); } });
    await until(() => states.at(-1)?.status === 'connected');
    expect(states.at(-1)?.cursor).toBe(saved.cursor);
    expect(states.at(-1)?.position).toEqual('position' in saved ? saved.position : undefined);
    sockets[0]!.close(1012);
    await until(() => sockets.length === 2);
    if ('position' in saved) expect(JSON.parse(urls[1]!.searchParams.get('start_at')!)).toEqual(saved.position);
    else expect(urls[1]!.searchParams.get('start_from')).toBe(String(saved.cursor));
  });

  it('rejects saved positions missing the room rather than silently skipping its history', async () => {
    await expect(fixture({ config: { position: { s: 10 } } })).rejects.toThrow('does not cover');
  });

  it('discovers schemas and rejects unadvertised operations and arguments', async () => {
    const { client, requests } = await fixture();
    await client.discover();
    await expect(client.operation('invented_endpoint', {})).rejects.toThrow('not advertised');
    await expect(client.operation('get_agent_detail', {})).rejects.toThrow('requires agent_id');
    await expect(client.operation('read_context', { fake: true })).rejects.toThrow('does not advertise');
    await expect(client.operation('read_context', { limit: 5 })).resolves.toEqual({ ok: true });
    expect(requests.at(-1)?.body).toEqual({ limit: 5 });
    expect(requests.at(-1)?.auth).toBe('Bearer synthetic-not-a-secret');
  });

  it('answers pings immediately but acknowledges only durably ingested messages', async () => {
    const { client, sockets, pongs } = await fixture();
    const states: ConnectionState[] = [];
    let complete: (() => void) | undefined;
    let entered = false;
    client.start({ onState: (state) => { states.push(state); }, onBlocked: (reason) => { throw new Error(reason); },
      onEvent: async () => { entered = true; await new Promise<void>((resolve) => { complete = resolve; }); } });
    await until(() => states.some((state) => state.status === 'connected'));
    sockets[0]!.send(JSON.stringify(syntheticMessage()));
    await until(() => entered);
    sockets[0]!.send(JSON.stringify({ event: 'ping', data: {} }));
    await until(() => pongs.length === 1);
    expect(pongs[0]).toEqual({ type: 'pong', cursor: 0 });
    complete!();
    await until(() => states.some((state) => state.cursor === 1));
    sockets[0]!.send(JSON.stringify({ event: 'ping', data: {} }));
    await until(() => pongs.length === 2);
    expect(pongs[1]).toEqual({ type: 'pong', cursor: 1 });
  });

  it('uses the same connection id, committed cursor, generation, and room on reconnect', async () => {
    const { client, sockets, urls } = await fixture();
    let cursor = 0;
    let connected = false;
    let delivered = 0;
    client.start({ onEvent: async () => { delivered += 1; }, onState: (state) => { cursor = state.cursor; connected = state.status === 'connected'; }, onBlocked: (reason) => { throw new Error(reason); } });
    await until(() => connected);
    sockets[0]!.send(JSON.stringify(syntheticMessage()));
    await until(() => cursor === 1);
    sockets[0]!.close(1012);
    await until(() => sockets.length === 2);
    expect(urls[1]!.searchParams.get('connection_id')).toBe('fixture-connection');
    expect(urls[1]!.searchParams.get('start_from')).toBe('1');
    expect(urls[1]!.searchParams.get('expected_generation')).toBe('1');
    expect(urls[1]!.searchParams.get('rooms')).toBe('synthetic-room');
    sockets[1]!.send(JSON.stringify(syntheticMessage()));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(delivered).toBe(1);
  });

  it.each(['gap', 'evicted'])('blocks on %s without silently advancing the cursor or reconnecting', async (kind) => {
    const { client, sockets } = await fixture();
    const states: ConnectionState[] = [];
    let blocked = '';
    client.start({ onEvent: async () => undefined, onState: (state) => { states.push(state); }, onBlocked: (reason) => { blocked = reason; } });
    await until(() => states.some((state) => state.status === 'connected'));
    sockets[0]!.send(JSON.stringify({ event: kind, data: kind === 'gap' ? { resumed_at: 200, reason: 'synthetic retention loss' } : { code: 'taken_over' } }));
    await until(() => blocked.length > 0);
    expect(states.at(-1)?.cursor).toBe(0);
    expect(states.at(-1)?.status).toBe('blocked');
    await expect(client.post('must not post')).rejects.toThrow('not connected');
  });

  it('leaves the cursor unchanged when durable ingestion fails', async () => {
    const { client, sockets } = await fixture();
    const states: ConnectionState[] = [];
    let blocked = '';
    client.start({ onEvent: async () => { throw new Error('synthetic database failure'); }, onState: (state) => { states.push(state); }, onBlocked: (reason) => { blocked = reason; } });
    await until(() => states.some((state) => state.status === 'connected'));
    sockets[0]!.send(JSON.stringify(syntheticMessage()));
    await until(() => blocked.length > 0);
    expect(states.at(-1)?.cursor).toBe(0);
    expect(blocked).toContain('Durable event processing failed');
  });
  it('detects a silent half-open stream and resumes using its committed checkpoint', async () => {
    const { client, sockets, urls } = await fixture();
    const states: ConnectionState[] = [];
    client.start({ onEvent: async () => undefined, onState: (state) => { states.push(state); }, onBlocked: (reason) => { throw new Error(reason); } });
    await until(() => states.at(-1)?.status === 'connected');
    sockets[0]!.send(JSON.stringify(syntheticMessage()));
    await until(() => states.at(-1)?.cursor === 1);
    // Synthetic server deliberately stops the protocol's two-second pings.
    await until(() => states.some((state) => state.status === 'disconnected'), 7000);
    await until(() => sockets.length === 2);
    expect(urls[1]!.searchParams.get('start_from')).toBe('1');
    expect(urls[1]!.searchParams.get('expected_generation')).toBe('1');
  });

  it('announces disconnect before draining an inbox receipt and never marks its checkpoint connected', async () => {
    const { client, sockets, urls } = await fixture();
    const states: ConnectionState[] = [];
    let finish!: () => void;
    let entered = false;
    client.start({ onEvent: async () => { entered = true; await new Promise<void>((resolve) => { finish = resolve; }); }, onState: (state) => { states.push(state); }, onBlocked: (reason) => { throw new Error(reason); } });
    await until(() => states.at(-1)?.status === 'connected');
    sockets[0]!.send(JSON.stringify(syntheticMessage()));
    await until(() => entered);
    sockets[0]!.close(1012);
    await until(() => states.at(-1)?.status === 'disconnected');
    await expect(client.post('must remain pending')).rejects.toThrow('not connected');
    expect(states.at(-1)?.cursor).toBe(0);
    finish();
    await until(() => states.at(-1)?.cursor === 1);
    expect(states.at(-1)?.status).toBe('disconnected');
    await until(() => sockets.length === 2);
    expect(urls[1]!.searchParams.get('start_from')).toBe('1');
  });

});
