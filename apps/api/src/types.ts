import type {
  Brief,
  Constraint,
  Revision,
  Patch,
  diffRevisions,
  validateScene,
} from "@two-hands/domain";
export type Role = "writer" | "stage";
export interface Proposal {
  id: string;
  baseRevisionId: string | null;
  candidate: Revision;
  digest: string;
  patch: Patch | null;
  affectedBeats: string[];
  dependentTransitions: string[];
  artisticCosts: string[];
  validation: ReturnType<typeof validateScene>;
  diff: ReturnType<typeof diffRevisions>;
  status:
    | "pending_review"
    | "eligible"
    | "rejected"
    | "committed"
    | "invalidated";
  review: string | null;
}
export interface Observation {
  id: string;
  revisionId: string;
  text: string;
  interpretation: string | null;
  status: "awaiting_confirmation" | "confirmed";
}
export interface Rehearsal {
  id: string;
  revisionId: string;
  outcome: "success" | "difficulty";
  text: string;
  source: "human" | "synthetic";
  withdrawn: boolean;
}
export interface Job {
  id: string;
  role: Role;
  kind: "create" | "interpret" | "repair" | "review";
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  model_attempts: number;
  error: string | null;
}
export interface IdentityMapping {
  roomId: string;
  bridgeId: string;
  participantId: string;
  mattermostUserId: string;
  mattermostChannelId: string;
  verifiedAt: string;
  evidence: string;
}
export interface ServiceConfig {
  databasePath: string;
  roomId: string;
  writerName: string;
  stageName: string;
  writerParticipantId: string;
  stageParticipantId: string;
  identity: IdentityMapping | null;
  publicUrl: string;
  synthetic?: boolean;
}
export interface CollaborationEvent {
  id: string;
  actor: 'human' | 'writer' | 'stage';
  to: 'human' | 'writer' | 'stage';
  kind: string;
  title: string;
  text: string;
  status: 'received' | 'sent' | 'pending' | 'uncertain' | 'failed' | 'withdrawn';
  timestamp: number | null;
  messageId: string | null;
  taskId: string | null;
  revisionId: string | null;
}
export interface State {
  collaboration: { events: CollaborationEvent[] };
  approvalHold: boolean;
  needsRepair: boolean;
  retryDraft: { eligible: boolean; remaining: number; reason: string };
  approvals: {
    proposalId: string;
    revisionId: string;
    digest: string;
    revoked: boolean;
  }[];
  deliveries: {
    id: string;
    role: string;
    status: string;
    error: string | null;
  }[];
  connection: {
    status: "disconnected" | "connecting" | "connected" | "blocked";
    detail: string;
  };
  brief: Brief | null;
  current: Revision | null;
  currentDigest: string | null;
  constraints: Constraint[];
  observations: Observation[];
  proposals: Proposal[];
  rehearsals: Rehearsal[];
  artifacts: {
    revisionId: string;
    digest: string;
    cueUrl: string;
    scriptUrl: string;
  }[];
  jobs: Job[];
  synthetic: boolean;
}
