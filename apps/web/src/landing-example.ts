import { applyPatch, validateScene, type Revision } from "@two-hands/domain";
import { syntheticRevision } from "../../../fixtures/scene.js";
/** Public synthetic example. Isolated from live scene state; never sent to the API. */
export const exampleOriginal: Revision = structuredClone(syntheticRevision);
const constraint = {
  id: "example-left-free",
  observationId: "example-observation",
  description: "Illustrative constraint: keep the left hand free throughout.",
  unavailableHand: "left" as const,
};
export const exampleRepairs = [
  {
    name: "Let the boat wait",
    kicker: "More space. Less closeness.",
    cost: "The boat stays on the table. The welcome feels patient rather than protective.",
    changed: "Two beats change. Four stay exactly as written.",
    revision: applyPatch(
      exampleOriginal,
      {
        beats: [
          {
            ...exampleOriginal.beats[0]!,
            actions: [{ type: "pause", seconds: 2 }],
          },
          {
            ...exampleOriginal.beats[2]!,
            actions: [
              {
                type: "move",
                propId: "p1",
                hand: "right",
                from: "table",
                to: "rest",
              },
            ],
          },
        ],
      },
      "example-repair-rest",
      [constraint],
    ),
  },
  {
    name: "Make the light arrive later",
    kicker: "Keep the gesture. Change the rhythm.",
    cost: "The right hand cradles the boat. Setting it down before moving the cup makes the lighthouse arrive a beat later.",
    changed: "Three beats change. The opening gesture survives.",
    revision: applyPatch(
      exampleOriginal,
      {
        beats: [
          {
            ...exampleOriginal.beats[0]!,
            actions: [
              { type: "hold", propId: "p1", hand: "right", from: "table" },
              { type: "pause", seconds: 2 },
            ],
          },
          {
            ...exampleOriginal.beats[1]!,
            actions: [
              { type: "place", propId: "p1", hand: "right", to: "table" },
              {
                type: "move",
                propId: "p2",
                hand: "right",
                from: "table",
                to: "rest",
              },
            ],
          },
          {
            ...exampleOriginal.beats[2]!,
            actions: [
              {
                type: "move",
                propId: "p1",
                hand: "right",
                from: "table",
                to: "rest",
              },
            ],
          },
        ],
      },
      "example-repair-right",
      [constraint],
    ),
  },
];
export const exampleValidation = validateScene(exampleOriginal);
