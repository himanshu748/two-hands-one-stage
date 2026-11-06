import { z } from "zod";
import type { SwitchMessage } from "@two-hands/switch-client";

/** Operator-audited runtime mapping, never model output or a display-name lookup. */
export const AuditCandidateSchema = z.object({
  room_id: z.string().min(1),
  bridge_id: z.string().min(1),
  event_sender: z.string().min(1),
  mattermost_user_id: z.string().min(1),
  mattermost_channel_id: z.string().min(1),
  claimed_gateway_user_id: z.string().min(1),
  room_member: z.literal(true),
  mattermost_is_bot: z.literal(false),
  audited_at: z.string().datetime(),
});
export type AuditCandidate = z.infer<typeof AuditCandidateSchema>;

export function matchesHumanNonce(
  event: SwitchMessage,
  candidate: AuditCandidate,
  nonce: string,
  startedAt: number,
  stageName: string,
): boolean {
  const { data } = event;
  const message = data.payload;
  if (
    data.room_id !== candidate.room_id ||
    data.bridge_id !== candidate.bridge_id ||
    message.sender !== candidate.event_sender ||
    !message.addressed ||
    message.timestamp < startedAt ||
    message.timestamp > Date.now() + 30_000
  ) return false;
  const body = message.body.trim();
  return body === `@${stageName} verify ${nonce}`;
}
