import { useId, useState } from "react";
import type { Location, Revision, State } from "@two-hands/domain";
import "./stage-view.css";

export interface StageViewProps {
  state: State;
  props: Revision["props"];
  highlight?: string | null;
  compact?: boolean;
  label?: string;
}
const locationLabels: Record<Location, string> = {
  table: "on the table",
  rest: "on the resting place",
  left: "in the left hand",
  right: "in the right hand",
};
function position(
  location: Location | undefined,
  index: number,
): { x: number; y: number } {
  if (location === "left") return { x: 24, y: 73 };
  if (location === "right") return { x: 76, y: 73 };
  if (location === "rest") return { x: 30 + index * 20, y: 24 };
  return { x: 30 + index * 20, y: 44 };
}
function PropMark({ id }: { id: string }) {
  return (
    <svg
      className="stage-prop-mark"
      viewBox="0 0 64 52"
      fill="none"
      aria-hidden="true"
    >
      {id === "p1" ? (
        <>
          <path
            d="M7 28 30 36 56 25 44 42H20L7 28Z"
            fill="currentColor"
            opacity=".9"
          />
          <path
            d="m17 28 15-19 16 18-17 7-14-6Z"
            fill="currentColor"
            opacity=".25"
          />
          <path d="m32 9-1 25 17-7L32 9Z" fill="currentColor" opacity=".58" />
          <path
            d="m7 28 24 8 25-11M20 42h24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </>
      ) : id === "p2" ? (
        <>
          <path
            d="M17 15h26l-2 24c0 6-22 6-22 0l-2-24Z"
            fill="currentColor"
            opacity=".82"
          />
          <ellipse
            cx="30"
            cy="15"
            rx="13"
            ry="5"
            fill="currentColor"
            opacity=".3"
          />
          <path
            d="M43 20c15-2 15 17-1 16"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            d="M21 17c5 3 14 3 19 0"
            stroke="var(--stage-paper)"
            strokeWidth="1.5"
            opacity=".8"
          />
        </>
      ) : (
        <>
          <circle
            cx="22"
            cy="20"
            r="10"
            stroke="currentColor"
            strokeWidth="6"
          />
          <path
            d="m29 27 19 18m-8-8 5-5m1 11 5-5"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="22" cy="20" r="3" fill="currentColor" opacity=".2" />
        </>
      )}
    </svg>
  );
}

/** A readable symbolic map, not a claim about physical reach, geometry or comfort. */
export function StageView({
  state,
  props: storyProps,
  highlight = null,
  compact = false,
  label = "Your tabletop stage",
}: StageViewProps) {
  const unique = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [selection, setSelection] = useState<string | null | undefined>(
    undefined,
  );
  const active = selection === undefined ? highlight : selection;
  const selectedProp = storyProps.find((prop) => prop.id === active);
  const describe = (id: string): string =>
    state.locations[id]
      ? locationLabels[state.locations[id]]
      : "location not set";
  const select = (id: string) => setSelection(active === id ? null : id);
  const handName = (hand: "left" | "right") => {
    const id = state.hands[hand];
    if (!id) return "Free";
    const index = storyProps.findIndex((prop) => prop.id === id);
    return index >= 0
      ? `Holding ${String(index + 1).padStart(2, "0")}`
      : "Occupied";
  };
  const titleId = `stage-title-${unique}`;
  const captionId = `stage-caption-${unique}`;
  return (
    <figure
      className={`stage-view${compact ? " stage-view--compact" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="stage-view-heading">
        <span id={titleId}>{label}</span>
        <span className="stage-model-label">Symbolic positions</span>
      </div>
      <div
        className="stage-canvas"
        role="group"
        aria-label="Three props, table, resting place and two hand zones"
        aria-describedby={captionId}
      >
        <svg
          className="stage-scenery"
          viewBox="0 0 720 440"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`stage-top-${unique}`}
              x1="360"
              y1="74"
              x2="360"
              y2="294"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#fffdf7" />
              <stop offset="1" stopColor="#e9e4d5" />
            </linearGradient>
            <linearGradient
              id={`stage-edge-${unique}`}
              x1="360"
              y1="253"
              x2="360"
              y2="307"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#cfbc96" />
              <stop offset="1" stopColor="#e2d5ba" />
            </linearGradient>
            <radialGradient
              id={`stage-light-${unique}`}
              cx="0"
              cy="0"
              r="1"
              gradientTransform="translate(360 169) rotate(90) scale(208 365)"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#fffefa" />
              <stop offset="1" stopColor="#f0eddf" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M0 0h720v440H0z" fill={`url(#stage-light-${unique})`} />
          <ellipse
            cx="360"
            cy="303"
            rx="278"
            ry="27"
            fill="#3e3424"
            opacity=".055"
          />
          <path
            d="M108 99Q360 37 612 99l52 155v16q-304 99-608 0v-16L108 99Z"
            fill={`url(#stage-edge-${unique})`}
            stroke="#c4b28d"
          />
          <path
            d="M108 99Q360 37 612 99l52 155q-304 99-608 0l52-155Z"
            fill={`url(#stage-top-${unique})`}
            stroke="#d0c5ac"
          />
          <path
            d="M113 103Q360 43 607 103l48 147q-295 95-590 0l48-147Z"
            stroke="#ffffff"
            opacity=".75"
          />
          <path
            d="M174 77Q360 51 546 77l13 57q-199 35-398 0l13-57Z"
            fill="#e3e8dc"
            stroke="#a8b9a5"
          />
          <path
            d="M183 83Q360 59 537 83l9 43q-186 31-372 0l9-43Z"
            stroke="#f7fbf2"
            opacity=".9"
          />
          <path
            d="M80 304q92-52 185 0v65q-93 45-185 0v-65Z"
            fill="#faf8ef"
            stroke="#c7c3b1"
            strokeWidth="1.3"
            strokeDasharray="5 6"
          />
          <path
            d="M455 304q92-52 185 0v65q-93 45-185 0v-65Z"
            fill="#faf8ef"
            stroke="#c7c3b1"
            strokeWidth="1.3"
            strokeDasharray="5 6"
          />
          <path
            d="M174 275v-13m-7 3 7-7 7 7m366 10v-13m-7 3 7-7 7 7"
            stroke="#aaa18a"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M130 258q230 61 460 0" stroke="#d4c9b1" opacity=".5" />
        </svg>
        <div className="stage-surface-label stage-surface-label--rest">
          <span>Resting place</span>
          <i aria-hidden="true" />
        </div>
        <div className="stage-surface-label stage-surface-label--table">
          The table
        </div>
        {(["left", "right"] as const).map((hand) => (
          <div
            key={hand}
            className={`stage-hand-label stage-hand-label--${hand}`}
            role="group"
            aria-label={`${hand} hand: ${state.hands[hand] ? (storyProps.find((prop) => prop.id === state.hands[hand])?.name ?? "unknown prop") : "free"}`}
          >
            <span>{hand === "left" ? "Left hand" : "Right hand"}</span>
            <strong className={state.hands[hand] ? "is-occupied" : ""}>
              {handName(hand)}
            </strong>
          </div>
        ))}
        {storyProps.map((prop, index) => {
          const point = position(state.locations[prop.id], index);
          return (
            <div
              key={prop.id}
              className={`stage-token-position stage-token-position--${prop.id}`}
              style={{ transform: `translate(${point.x}%, ${point.y}%)` }}
            >
              <button
                type="button"
                className={`stage-token${active === prop.id ? " is-active" : ""}`}
                onClick={() => select(prop.id)}
                aria-label={`Inspect ${prop.name}, ${describe(prop.id)}`}
                aria-pressed={active === prop.id}
              >
                <span className="stage-token-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <PropMark id={prop.id} />
              </button>
            </div>
          );
        })}
      </div>
      <figcaption className="stage-view-caption">
        <p
          id={captionId}
          className="stage-selection-caption"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedProp ? (
            <>
              <span
                className={`stage-caption-dot stage-caption-dot--${selectedProp.id}`}
                aria-hidden="true"
              />
              <strong>{selectedProp.name}</strong>
              <span>{describe(selectedProp.id)}.</span>
            </>
          ) : (
            <>
              <span className="stage-caption-arrow" aria-hidden="true">
                ↖
              </span>
              <span>Select a prop to inspect its position.</span>
            </>
          )}
        </p>
        <ul className="stage-prop-legend" aria-label="Prop positions">
          {storyProps.map((prop, index) => (
            <li key={prop.id}>
              <button
                type="button"
                className={`stage-legend-button stage-legend-button--${prop.id}${active === prop.id ? " is-active" : ""}`}
                onClick={() => select(prop.id)}
                aria-pressed={active === prop.id}
              >
                <span className="stage-legend-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{prop.name}</strong>
                  <small>{describe(prop.id)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
export default StageView;
