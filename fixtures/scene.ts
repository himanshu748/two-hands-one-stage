import type { Revision } from '@two-hands/domain';

/** Synthetic automated-test fixture. No human rehearsal or live Switch interaction is implied. */
export const syntheticRevision: Revision = {
  id: 'synthetic-r1',
  parentRevisionId: null,
  sceneId: 'synthetic-lighthouse',
  title: 'A light left on',
  props: [{ id: 'p1', name: 'Paper boat' }, { id: 'p2', name: 'Blue cup' }, { id: 'p3', name: 'Brass key' }],
  emotionalGoal: 'Turn a small moment of loneliness into welcome.',
  protectedFact: 'The boat belongs to the person who has not yet returned.',
  initialState: { hands: { left: null, right: null }, locations: { p1: 'table', p2: 'table', p3: 'table' } },
  constraints: [],
  beats: [
    { id: 'b1', title: 'The empty shore', dialogue: 'I kept your boat exactly where you left it.', seconds: 12,
      actions: [{ type: 'hold', propId: 'p1', hand: 'left', from: 'table' }, { type: 'pause', seconds: 2 }] },
    { id: 'b2', title: 'A small lighthouse', dialogue: 'A cup can be a lighthouse, if someone is watching.', seconds: 12,
      actions: [{ type: 'move', propId: 'p2', hand: 'right', from: 'table', to: 'rest' }] },
    { id: 'b3', title: 'Room to wait', dialogue: 'I made a little room beside the light.', seconds: 12,
      actions: [{ type: 'place', propId: 'p1', hand: 'left', to: 'rest' }] },
    { id: 'b4', title: 'An open door', dialogue: 'Your key still fits. I checked.', seconds: 12,
      actions: [{ type: 'hold', propId: 'p3', hand: 'right', from: 'table' }, { type: 'release', propId: 'p3', hand: 'right', to: 'table' }] },
    { id: 'b5', title: 'Keep the light', dialogue: 'I can wait without holding everything.', seconds: 12,
      actions: [{ type: 'move', propId: 'p2', hand: 'right', from: 'rest', to: 'table' }] },
    { id: 'b6', title: 'A place for you', dialogue: 'When you return, there will be a place for you.', seconds: 12,
      actions: [{ type: 'pause', seconds: 3 }] },
  ],
};
