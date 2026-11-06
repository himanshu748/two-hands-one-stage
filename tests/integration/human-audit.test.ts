import { describe, expect, it } from "vitest";
import { AuditCandidateSchema, matchesHumanNonce } from "../../scripts/human-audit.js";
import type { SwitchMessage } from "@two-hands/switch-client";

const now = Date.now();
const candidate = AuditCandidateSchema.parse({ room_id: "synthetic-room", bridge_id: "synthetic-bridge", event_sender: "synthetic-human", mattermost_user_id: "synthetic-user", mattermost_channel_id: "synthetic-channel", claimed_gateway_user_id: "synthetic-owner", room_member: true, mattermost_is_bot: false, audited_at: new Date(now).toISOString() });
function fixture(): SwitchMessage { return { event: "message", id: 1, data: { type: "message", room_id: candidate.room_id, bridge_id: candidate.bridge_id, channel_type: "channel_private", sequence: 1, payload: { sender: candidate.event_sender, sender_name: "irrelevant display name", message_id: "synthetic-message", addressed: true, timestamp: now, body: "@two-hands-stage verify synthetic-nonce" } } }; }
describe("operator human nonce audit — synthetic envelopes only", () => {
  it("accepts only the fresh exact addressed challenge from the audited origin", () => {
    expect(matchesHumanNonce(fixture(), candidate, "synthetic-nonce", now, "two-hands-stage")).toBe(true);
  });
  it.each(["agent", "bridge", "room", "unaddressed", "replayed", "wrong-nonce", "quoted"])("rejects %s even when display name matches", kind => {
    const event=fixture();
    if(kind==="agent") event.data.payload.sender="synthetic-stage";
    if(kind==="bridge") event.data.bridge_id="another-bridge";
    if(kind==="room") event.data.room_id="another-room";
    if(kind==="unaddressed") event.data.payload.addressed=false;
    if(kind==="replayed") event.data.payload.timestamp=now-1;
    if(kind==="wrong-nonce") event.data.payload.body="@two-hands-stage verify other";
    if(kind==="quoted") event.data.payload.body="> @two-hands-stage verify synthetic-nonce";
    expect(matchesHumanNonce(event,candidate,"synthetic-nonce",now,"two-hands-stage")).toBe(false);
  });
  it("refuses bot and nonmember mappings before listening", () => {
    expect(AuditCandidateSchema.safeParse({...candidate,mattermost_is_bot:true}).success).toBe(false);
    expect(AuditCandidateSchema.safeParse({...candidate,room_member:false}).success).toBe(false);
  });
});
