import { z } from 'zod';

export const PROP_IDS = ['p1', 'p2', 'p3'] as const;
export const BEAT_IDS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const;
export const HandSchema = z.enum(['left', 'right']);
export const SurfaceSchema = z.enum(['table', 'rest']);
export const LocationSchema = z.enum(['left', 'right', 'table', 'rest']);
export type Hand = z.infer<typeof HandSchema>;
export type Location = z.infer<typeof LocationSchema>;
const identifier = z.string().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/, 'Use a stable identifier without whitespace');
const text = z.string().min(1).regex(/\S/, 'Must contain non-whitespace text').max(2000);
const propReference = z.string().min(1).max(160);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hold'), propId: propReference, hand: HandSchema, from: SurfaceSchema }).strict(),
  z.object({ type: z.literal('place'), propId: propReference, hand: HandSchema, to: SurfaceSchema }).strict(),
  z.object({ type: z.literal('move'), propId: propReference, hand: HandSchema, from: SurfaceSchema, to: SurfaceSchema }).strict(),
  z.object({ type: z.literal('release'), propId: propReference, hand: HandSchema, to: SurfaceSchema }).strict(),
  z.object({ type: z.literal('speak'), text }).strict(),
  z.object({ type: z.literal('pause'), seconds: z.number().finite().positive().max(120) }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;

export const BeatSchema = z.object({
  id: z.enum(BEAT_IDS),
  title: z.string().min(1).regex(/\S/, 'Must contain non-whitespace text').max(120),
  dialogue: z.string().max(4000),
  seconds: z.number().finite().min(2).max(120),
  actions: z.array(ActionSchema).min(1).max(30),
}).strict();
export type Beat = z.infer<typeof BeatSchema>;

export const ConstraintSchema = z.object({
  id: identifier,
  observationId: identifier,
  description: text,
  unavailableHand: HandSchema.nullable(),
}).strict();
export type Constraint = z.infer<typeof ConstraintSchema>;

const propSchema = z.object({ id: z.enum(PROP_IDS), name: z.string().min(1).regex(/\S/, 'Must contain non-whitespace text').max(80) }).strict();
const propsSchema = z.array(propSchema).length(3).superRefine((props, ctx) => {
  if (new Set(props.map((prop) => prop.id)).size !== 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Declare each of p1, p2, and p3 exactly once' });
  }
  if (new Set(props.map((prop) => prop.name.toLocaleLowerCase('en-US'))).size !== 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Give the three props distinct names' });
  }
});
const briefShape = {
  sceneId: identifier,
  title: z.string().min(1).regex(/\S/, 'Must contain non-whitespace text').max(160),
  props: propsSchema,
  emotionalGoal: text,
  protectedFact: text,
};
export const BriefSchema = z.object(briefShape).strict();
export type Brief = z.infer<typeof BriefSchema>;

export const StateSchema = z.object({
  hands: z.object({ left: propReference.nullable(), right: propReference.nullable() }).strict(),
  locations: z.record(z.string(), LocationSchema),
}).strict();
export type State = z.infer<typeof StateSchema>;

export const RevisionSchema = z.object({
  ...briefShape,
  id: identifier,
  parentRevisionId: identifier.nullable(),
  initialState: StateSchema,
  constraints: z.array(ConstraintSchema).max(12),
  beats: z.array(BeatSchema).length(6),
}).strict().superRefine((revision, ctx) => {
  if (!revision.beats.every((beat, index) => beat.id === BEAT_IDS[index])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beats'], message: 'The six beats must retain the ordered IDs b1 through b6' });
  }
  if (new Set(revision.constraints.map((constraint) => constraint.id)).size !== revision.constraints.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['constraints'], message: 'Constraint IDs must be unique' });
  }
  if (revision.id === revision.parentRevisionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parentRevisionId'], message: 'A revision cannot be its own parent' });
  }
});
export type Revision = z.infer<typeof RevisionSchema>;

export const PatchSchema = z.object({ beats: z.array(BeatSchema).min(1).max(6) }).strict().superRefine((patch, ctx) => {
  if (new Set(patch.beats.map((beat) => beat.id)).size !== patch.beats.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beats'], message: 'A patch may replace a beat only once' });
  }
});
export type Patch = z.infer<typeof PatchSchema>;

export interface ValidationIssue {
  code: string;
  beatId: string | null;
  actionIndex: number | null;
  message: string;
}
export interface Transition { beatId: string; before: State; after: State }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[]; transitions: Transition[] }

function copyState(state: State): State {
  return { hands: { ...state.hands }, locations: { ...state.locations } };
}

/** A bounded symbolic action check. Success says nothing about weight, reach, comfort or acting quality. */
export function validateScene(input: Revision): ValidationResult {
  const parsed = RevisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({ code: 'invalid_schema', beatId: null, actionIndex: null, message: `${issue.path.join('.') || 'revision'}: ${issue.message}` })),
      transitions: [],
    };
  }
  const scene = parsed.data;
  const issues: ValidationIssue[] = [];
  const transitions: Transition[] = [];
  const props = new Set<string>(scene.props.map((prop) => prop.id));
  const unavailable = new Set<Hand>();
  const state = copyState(scene.initialState);
  const add = (code: string, message: string, beatId: string | null = null, actionIndex: number | null = null) => {
    issues.push({ code, beatId, actionIndex, message });
  };

  for (const constraint of scene.constraints) {
    if (constraint.unavailableHand === null) {
      add('unsupported_constraint', `Constraint ${constraint.id} needs a supported human-confirmed interpretation; this model cannot check: ${constraint.description}`);
    } else unavailable.add(constraint.unavailableHand);
  }
  for (const id of props) {
    if (!Object.hasOwn(state.locations, id)) add('missing_location', `Prop ${id} has no initial location.`);
  }
  for (const id of Object.keys(state.locations)) {
    if (!props.has(id)) add('missing_prop', `Initial location refers to undeclared prop ${id}.`);
  }
  for (const hand of ['left', 'right'] as const) {
    const propId = state.hands[hand];
    if (propId !== null) {
      if (!props.has(propId)) add('missing_prop', `${hand} hand refers to undeclared prop ${propId}.`);
      if (state.locations[propId] !== hand) add('inconsistent_location', `${propId} is assigned to the ${hand} hand but its location is ${state.locations[propId] ?? 'missing'}.`);
      if (unavailable.has(hand)) add('unavailable_hand', `The unavailable ${hand} hand starts occupied.`);
    }
  }
  if (state.hands.left !== null && state.hands.left === state.hands.right) {
    add('inconsistent_location', `Prop ${state.hands.left} cannot occupy both hands in this one-hand-per-prop model.`);
  }
  for (const [id, location] of Object.entries(state.locations)) {
    if ((location === 'left' || location === 'right') && state.hands[location] !== id) {
      add('inconsistent_location', `${id} is located in the ${location} hand but the hand assignment disagrees.`);
    }
  }
  // An incoherent starting state has no meaningful downstream simulation.
  if (issues.some((issue) => ['missing_location', 'missing_prop', 'inconsistent_location', 'unavailable_hand'].includes(issue.code))) {
    return { valid: false, issues, transitions };
  }

  for (const beat of scene.beats) {
    const pauseSeconds = beat.actions.reduce((total, action) => total + (action.type === 'pause' ? action.seconds : 0), 0);
    if (pauseSeconds > beat.seconds) {
      add('pause_exceeds_beat', `Declared pauses require ${pauseSeconds} seconds but the beat allows ${beat.seconds}.`, beat.id);
    }
    const before = copyState(state);
    beat.actions.forEach((action, actionIndex) => {
      const fail = (code: string, message: string) => add(code, message, beat.id, actionIndex);
      if (action.type === 'speak' || action.type === 'pause') return;
      if (!props.has(action.propId)) {
        fail('missing_prop', `Action refers to undeclared prop ${action.propId}.`);
        return;
      }
      if (unavailable.has(action.hand)) {
        fail('unavailable_hand', `The ${action.hand} hand is unavailable under a confirmed constraint.`);
        return;
      }
      const held = state.hands[action.hand];
      const location = state.locations[action.propId];
      if (action.type === 'hold' || action.type === 'move') {
        if (held !== null) {
          fail('hand_occupied', `The ${action.hand} hand already holds ${held}; it cannot ${action.type} ${action.propId}.`);
          return;
        }
        if (location !== action.from) {
          fail('precondition_location', `${action.propId} must be on ${action.from} before ${action.type}; it is at ${location}.`);
          return;
        }
        if (action.type === 'hold') {
          state.hands[action.hand] = action.propId;
          state.locations[action.propId] = action.hand;
        } else state.locations[action.propId] = action.to;
      } else {
        if (held !== action.propId || location !== action.hand) {
          fail('not_held', `The ${action.hand} hand must hold ${action.propId} before ${action.type}; it holds ${held ?? 'nothing'}.`);
          return;
        }
        state.hands[action.hand] = null;
        state.locations[action.propId] = action.to;
      }
    });
    transitions.push({ beatId: beat.id, before, after: copyState(state) });
  }
  return { valid: issues.length === 0, issues, transitions };
}

/** Canonical JSON, suitable for hashing by a server. Rejects non-JSON data rather than silently dropping it. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Canonical JSON requires plain objects');
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new Error(`Canonical JSON cannot encode ${typeof value}`);
}

export function applyPatch(base: Revision, input: Patch, newId: string, constraints?: Constraint[]): Revision {
  RevisionSchema.parse(base);
  const patch = PatchSchema.parse(input);
  if (newId === base.id) throw new Error('A patch needs a new revision ID');
  const replacements = new Map(patch.beats.map((beat) => [beat.id, beat]));
  // JSON cloning keeps the returned revision immutable relative to both inputs.
  const candidate: Revision = structuredClone({
    ...base,
    id: newId,
    parentRevisionId: base.id,
    constraints: constraints ?? base.constraints,
    beats: base.beats.map((beat) => replacements.get(beat.id) ?? beat),
  });
  return RevisionSchema.parse(candidate);
}

export interface BeatDiff { beatId: string; before: Beat; after: Beat }
export function diffRevisions(base: Revision, candidate: Revision): BeatDiff[] {
  RevisionSchema.parse(base);
  RevisionSchema.parse(candidate);
  return base.beats.flatMap((before, index) => {
    const after = candidate.beats[index];
    if (!after) throw new Error('Candidate is missing a stable beat');
    return canonicalize(before) === canonicalize(after) ? [] : [{ beatId: before.id, before: structuredClone(before), after: structuredClone(after) }];
  });
}
