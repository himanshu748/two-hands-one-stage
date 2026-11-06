import { describe, expect, it } from 'vitest';
import { syntheticRevision } from '../../../fixtures/scene.js';
import { applyPatch, canonicalize, diffRevisions, RevisionSchema, validateScene, type Revision } from './index.js';

const scene = (): Revision => structuredClone(syntheticRevision);

describe('bounded physical action model', () => {
  it('checks a complete six-beat synthetic scene and keeps snapshots independent', () => {
    const revision = scene();
    const result = validateScene(revision);
    expect(result.valid).toBe(true);
    expect(result.transitions).toHaveLength(6);
    expect(result.transitions[0]?.after.hands.left).toBe('p1');
    expect(result.transitions[2]?.after.hands.left).toBe(null);
    expect(result.transitions[0]?.after.hands.left).toBe('p1');
    expect(revision).toEqual(syntheticRevision);
  });

  it('rejects two props allocated to the same hand', () => {
    const revision = scene();
    revision.beats[0]!.actions.push({ type: 'hold', hand: 'left', propId: 'p3', from: 'table' });
    const result = validateScene(revision);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'hand_occupied', beatId: 'b1', actionIndex: 2 }));
    // A failed action does not corrupt the state for the next beat.
    expect(result.transitions[0]?.after.hands.left).toBe('p1');
    expect(result.transitions[0]?.after.locations.p3).toBe('table');
  });

  it('rejects undeclared props without allowing a phantom location', () => {
    const revision = scene();
    revision.beats[0]!.actions = [{ type: 'hold', hand: 'left', propId: 'p4', from: 'table' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'missing_prop', beatId: 'b1' }));
  });

  it('rejects a missing initial prop location', () => {
    const revision = scene();
    delete revision.initialState.locations.p2;
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'missing_location' }));
  });

  it.each([
    { hands: { left: 'p1', right: null }, locations: { p1: 'table', p2: 'table', p3: 'table' } },
    { hands: { left: null, right: null }, locations: { p1: 'left', p2: 'table', p3: 'table' } },
    { hands: { left: 'p1', right: 'p1' }, locations: { p1: 'left', p2: 'table', p3: 'table' } },
  ] as Revision['initialState'][])('rejects inconsistent initial locations %#', (initialState) => {
    const revision = scene();
    revision.initialState = initialState;
    const result = validateScene(revision);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'inconsistent_location')).toBe(true);
    expect(result.transitions).toHaveLength(0);
  });

  it('enforces starting surface and one free hand for move', () => {
    const revision = scene();
    revision.beats[1]!.actions = [{ type: 'move', propId: 'p2', hand: 'left', from: 'table', to: 'rest' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'hand_occupied', beatId: 'b2' }));
    revision.beats[1]!.actions = [{ type: 'move', propId: 'p2', hand: 'right', from: 'rest', to: 'table' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'precondition_location', beatId: 'b2' }));
  });

  it('does not release a prop from a hand that does not hold it', () => {
    const revision = scene();
    revision.beats[3]!.actions = [{ type: 'release', hand: 'right', propId: 'p3', to: 'table' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'not_held', beatId: 'b4' }));
  });

  it('makes move atomic: a free hand picks up and places, ending free', () => {
    const result = validateScene(scene());
    expect(result.transitions[1]?.before.hands.right).toBe(null);
    expect(result.transitions[1]?.after.hands.right).toBe(null);
    expect(result.transitions[1]?.after.locations.p2).toBe('rest');
  });

  it('enforces confirmed unavailable hands during every action', () => {
    const revision = scene();
    revision.constraints = [{ id: 'c1', observationId: 'o1', description: 'Left hand is unavailable', unavailableHand: 'left' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'unavailable_hand', beatId: 'b1' }));
  });

  it('rejects an unavailable hand already occupied in the initial state', () => {
    const revision = scene();
    revision.initialState = { hands: { left: 'p1', right: null }, locations: { p1: 'left', p2: 'table', p3: 'table' } };
    revision.constraints = [{ id: 'c1', observationId: 'o1', description: 'Left hand is unavailable', unavailableHand: 'left' }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'unavailable_hand', beatId: null }));
  });

  it('blocks unsupported descriptive constraints instead of pretending to check them', () => {
    const revision = scene();
    revision.constraints = [{ id: 'c1', observationId: 'o1', description: 'The cup is too heavy', unavailableHand: null }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'unsupported_constraint' }));
  });

  it('rejects known pause durations longer than the cue interval', () => {
    const revision = scene();
    revision.beats[5]!.seconds = 4;
    revision.beats[5]!.actions = [{ type: 'pause', seconds: 3 }, { type: 'pause', seconds: 3 }];
    expect(validateScene(revision).issues).toContainEqual(expect.objectContaining({ code: 'pause_exceeds_beat', beatId: 'b6' }));
  });

  it('speak and pause do not consume hands or move props', () => {
    const revision = scene();
    revision.beats[5]!.actions = [{ type: 'speak', text: 'Welcome home.' }, { type: 'pause', seconds: 2 }];
    const result = validateScene(revision);
    expect(result.valid).toBe(true);
    expect(result.transitions[5]?.before).toEqual(result.transitions[5]?.after);
  });
});

describe('localized patches and whole-scene validation', () => {
  it('rejects a locally feasible change that breaks a later unchanged beat', () => {
    const base = scene();
    // Returning the cup to the table in b2 is feasible in isolation, but b5 still expects it on rest.
    const changed = { ...base.beats[1]!, actions: [{ type: 'move' as const, propId: 'p2', hand: 'right' as const, from: 'table' as const, to: 'table' as const }] };
    const candidate = applyPatch(base, { beats: [changed] }, 'synthetic-r2');
    const result = validateScene(candidate);
    expect(result.transitions[1]?.after.locations.p2).toBe('table');
    expect(result.issues.filter((issue) => issue.beatId === 'b2')).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'precondition_location', beatId: 'b5' }));
    expect(candidate.beats[4]).toEqual(base.beats[4]);
  });

  it('preserves unaffected content exactly and reports only changed beats', () => {
    const base = scene();
    base.beats[0]!.title = '  Deliberate whitespace  ';
    const patch = { beats: [{ ...base.beats[1]!, dialogue: 'A light can wait beside an empty boat.' }] };
    const candidate = applyPatch(base, patch, 'synthetic-r2');
    expect(candidate.parentRevisionId).toBe(base.id);
    for (const index of [0, 2, 3, 4, 5]) expect(canonicalize(candidate.beats[index])).toBe(canonicalize(base.beats[index]));
    expect(candidate.protectedFact).toBe(base.protectedFact);
    expect(candidate.props).toEqual(base.props);
    expect(candidate.emotionalGoal).toBe(base.emotionalGoal);
    expect(diffRevisions(base, candidate).map((diff) => diff.beatId)).toEqual(['b2']);
    candidate.beats[0]!.dialogue = 'Do not mutate the base';
    expect(base.beats[0]!.dialogue).toBe(syntheticRevision.beats[0]!.dialogue);
  });

  it('refuses duplicate, unknown, or missing replacement beat IDs', () => {
    const base = scene();
    expect(() => applyPatch(base, { beats: [base.beats[0]!, base.beats[0]!] }, 'synthetic-r2')).toThrow();
    expect(() => applyPatch(base, { beats: [{ ...base.beats[0]!, id: 'b7' }] } as never, 'synthetic-r2')).toThrow();
    expect(() => applyPatch(base, { beats: [] }, 'synthetic-r2')).toThrow();
    expect(() => applyPatch(base, { beats: [base.beats[0]!] }, base.id)).toThrow();
  });

  it('requires six stable ordered beats and exactly three stable named props', () => {
    const base = scene();
    expect(RevisionSchema.safeParse({ ...base, beats: [...base.beats].reverse() }).success).toBe(false);
    expect(RevisionSchema.safeParse({ ...base, props: [base.props[0], base.props[0], base.props[2]] }).success).toBe(false);
    expect(RevisionSchema.safeParse({ ...base, props: [...base.props, { id: 'p4', name: 'Extra' }] }).success).toBe(false);
    expect(RevisionSchema.safeParse({ ...base, beats: base.beats.slice(0, 5) }).success).toBe(false);
  });

  it('does not allow patch objects to change the protected fact or initial state', () => {
    const base = scene();
    expect(() => applyPatch(base, { beats: [base.beats[0]!], protectedFact: 'Replaced' } as never, 'synthetic-r2')).toThrow();
  });

  it('provides stable canonical JSON independent of key insertion order', () => {
    expect(canonicalize({ b: [2, 1], a: { z: null, c: true } })).toBe(canonicalize({ a: { c: true, z: null }, b: [2, 1] }));
    expect(() => canonicalize({ value: undefined })).toThrow();
    expect(() => canonicalize(Number.NaN)).toThrow();
    expect(() => canonicalize(new Date())).toThrow();
  });
});
