import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@two-hands/domain';
import { syntheticRevision } from '../../fixtures/scene.js';
import { renderArtifact } from '../../apps/api/src/render.js';

const digestOf = (value: unknown) => createHash('sha256').update(canonicalize(value)).digest('hex');

describe('immutable HTML artifacts — synthetic revision, no human approval evidence', () => {
  it('renders both outputs with the exact same revision ID and canonical content digest', () => {
    const revision = structuredClone(syntheticRevision);
    const digest = digestOf(revision);
    const cue = renderArtifact(revision, digest, 'cue', true);
    const script = renderArtifact(revision, digest, 'script', true);
    for (const html of [cue, script]) {
      expect(html).toContain(`<meta name="revision-id" content="${revision.id}">`);
      expect(html).toContain(`<meta name="content-digest" content="${digest}">`);
      expect(html.match(/<article class="beat"/g)).toHaveLength(6);
      expect(html).toContain('Synthetic test artifact.');
      expect(html).toContain('Human rehearsal recorded separately');
      expect(html).toContain('Paper boat');
      expect(html).toContain('Starting hands — left: free; right: free.');
    }
    expect(script).not.toContain('<script>');
    expect(script).not.toContain('press Start');
    expect(script).toContain('at your own pace');
    expect(cue).toContain('Start the scene');
    expect(revision).toEqual(syntheticRevision);
  });

  it('renders matching dialogue exactly at its action, preserving explicit repetitions and the revision', () => {
    const revision = structuredClone(syntheticRevision);
    const beat = revision.beats[0]!;
    beat.dialogue = 'Synthetic reference line.';
    beat.actions.push({ type: 'speak', text: beat.dialogue }, { type: 'speak', text: beat.dialogue }, { type: 'speak', text: 'A separate spoken cue.' });
    const before = structuredClone(revision);
    for (const kind of ['cue', 'script'] as const) {
      const html = renderArtifact(revision, digestOf(revision), kind, true);
      expect(html.match(/Synthetic reference line\./g)).toHaveLength(2);
      expect(html).not.toContain('Say this beat’s dialogue now.');
      expect(html).toContain('A separate spoken cue.');
      expect(html).toContain('repeated cues are performed each time');
    }
    expect(revision).toEqual(before);
  });

  it('rejects the wrong digest and rejects physically invalid scenes', () => {
    expect(() => renderArtifact(syntheticRevision, '0'.repeat(64), 'cue')).toThrow('digest');
    const invalid = structuredClone(syntheticRevision);
    invalid.beats[1]!.actions = [{ type: 'hold', hand: 'left', propId: 'p2', from: 'table' }];
    expect(() => renderArtifact(invalid, digestOf(invalid), 'script')).toThrow('invalid scene');
  });

  it('escapes every user/model text field and permits only the fixed script/style hashes', () => {
    const dangerous = structuredClone(syntheticRevision);
    dangerous.title = 'Title </title><script>alert(1)</script>';
    dangerous.props[0]!.name = '<img src=x onerror=alert(1)>';
    dangerous.protectedFact = 'A "quote" & <form action="https://example.invalid">';
    dangerous.beats[0]!.dialogue = '</script><script>window.injected = true</script>';
    dangerous.beats[0]!.actions.push({ type: 'speak', text: '<svg onload=alert(1)>' });
    const html = renderArtifact(dangerous, digestOf(dangerous), 'cue', true);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('<script>window.injected');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;window.injected = true&lt;/script&gt;');
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('connect-src &#39;none&#39;');
    expect(html).not.toContain('unsafe-inline');
    expect(html.match(/<script>/g)).toHaveLength(1);
    const fixedScript = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(fixedScript).toBeDefined();
    expect(html).toContain(`sha256-${createHash('sha256').update(fixedScript!).digest('base64')}`);
  });

  it('does not embed external resources, credentials, or mutable rehearsal data', () => {
    const html = renderArtifact(syntheticRevision, digestOf(syntheticRevision), 'cue', true);
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('WebSocket');
    expect(html).not.toContain('Bearer');
    expect(html).not.toContain('OPENAI_API_KEY');
    expect(html).toContain('Playing these cues does not create rehearsal evidence.');
    expect(html).toContain('Put everything back before starting over');
  });
});
