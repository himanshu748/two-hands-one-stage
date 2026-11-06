import { z } from 'zod';
import { BriefSchema, RevisionSchema, ConstraintSchema, BeatSchema, PatchSchema } from '@two-hands/domain';

const IssueSchema = z.object({ code: z.string(), beatId: z.string().nullable(), actionIndex: z.number().nullable(), message: z.string() });
const PhysicalStateSchema = z.object({ hands: z.object({ left: z.string().nullable(), right: z.string().nullable() }), locations: z.record(z.string(), z.enum(['left', 'right', 'table', 'rest'])) });
const ProposalSchema = z.object({
  id: z.string(), baseRevisionId: z.string().nullable(), candidate: RevisionSchema,
  digest: z.string(), patch: PatchSchema.nullable(), affectedBeats: z.array(z.string()), dependentTransitions: z.array(z.string()),
  artisticCosts: z.array(z.string()), validation: z.object({ valid: z.boolean(), issues: z.array(IssueSchema), transitions: z.array(z.object({ beatId: z.string(), before: PhysicalStateSchema, after: PhysicalStateSchema })) }),
  diff: z.array(z.object({ beatId: z.string(), before: BeatSchema, after: BeatSchema })),
  status: z.enum(['pending_review', 'eligible', 'rejected', 'committed', 'invalidated']), review: z.string().nullable(),
});
export const CollaborationEventSchema = z.object({
 id: z.string(), actor: z.enum(['human','writer','stage']), to: z.enum(['human','writer','stage']), kind: z.string(), title: z.string(), text: z.string(),
 status: z.enum(['received','sent','pending','uncertain','failed','withdrawn']), timestamp: z.number().nullable(), messageId: z.string().nullable(), taskId: z.string().nullable(), revisionId: z.string().nullable(),
});
export type CollaborationEvent = z.infer<typeof CollaborationEventSchema>;
export const WorkbenchStateSchema = z.object({
 collaboration: z.object({events:z.array(CollaborationEventSchema)}).default({events:[]}),
  connection: z.object({ status: z.enum(['disconnected', 'connecting', 'connected', 'blocked']), detail: z.string() }),
  brief: BriefSchema.nullable(), current: RevisionSchema.nullable(), currentDigest: z.string().nullable(),
  constraints: z.array(ConstraintSchema),
  observations: z.array(z.object({ id: z.string(), revisionId: z.string(), text: z.string(), interpretation: z.string().nullable(), status: z.enum(['awaiting_confirmation', 'confirmed']) })),
  proposals: z.array(ProposalSchema),
  rehearsals: z.array(z.object({ id: z.string(), revisionId: z.string(), outcome: z.enum(['success', 'difficulty']), text: z.string(), source: z.enum(['human', 'synthetic']), withdrawn: z.boolean().default(false) })),
  artifacts: z.array(z.object({ revisionId: z.string(), digest: z.string(), cueUrl: z.string(), scriptUrl: z.string() })),
  jobs: z.array(z.object({ id: z.string(), role: z.string(), status: z.string(), error: z.string().nullable() })),
  approvalHold: z.boolean().default(false),
  needsRepair: z.boolean().default(false),
  retryDraft: z.object({ eligible: z.boolean(), remaining: z.number().int().nonnegative(), reason: z.string() }).optional(),
  approvals: z.array(z.object({ proposalId: z.string(), revisionId: z.string(), digest: z.string(), revoked: z.boolean() })).default([]),
  deliveries: z.array(z.object({ id: z.string(), role: z.string(), status: z.string(), error: z.string().nullable() })).default([]),
  synthetic: z.boolean(),
});
export type WorkbenchState = z.infer<typeof WorkbenchStateSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
