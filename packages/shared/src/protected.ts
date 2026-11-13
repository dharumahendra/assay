import { z } from "zod";
import { ContractJobSchema, ContractParamsSchema, U128 } from "./contract.js";
import { CriteriaDocSchema, EvidenceSchema, VerdictLabelSchema } from "./criteria.js";

/** Protected Job read API (05 §8): contract state joined with Juri's blobs and jury-runner state. */

export const JurorPhaseSchema = z.enum(["pending", "judged", "committed", "revealed", "failed"]);
export type JurorPhase = z.infer<typeof JurorPhaseSchema>;

export const JurorViewSchema = z.object({
  verifier: z.string(),
  /** Model from the on-chain reveal, else from the evidence blob, else the verifier's registered label. */
  model: z.string().nullable(),
  provider: z.string().nullable(),
  /** On-chain progress wins; runner_state fills in judged/failed before anything is on chain. */
  phase: JurorPhaseSchema,
  committed: z.boolean(),
  revealed: z.boolean(),
  verdicts: z.array(VerdictLabelSchema).nullable(),
  injection_flag: z.boolean().nullable(),
  /** TEE attestation captured and its signature verified (NEAR AI Cloud). */
  attested: z.boolean(),
  attestation_hash: z.string().nullable(),
  evidence_sha: z.string().nullable(),
  /** The evidence blob is stored here and matches the hash revealed on chain. */
  evidence_available: z.boolean(),
  error: z.string().nullable(),
  commit_tx: z.string().nullable(),
  reveal_tx: z.string().nullable(),
});
export type JurorView = z.infer<typeof JurorViewSchema>;

export const DeliverableMetaSchema = z.object({
  hash: z.string(),
  uri: z.string().nullable(),
  /** Stored by Juri's blob store and matching the on-chain hash. */
  available: z.boolean(),
  size: z.number().nullable(),
  content_type: z.string().nullable(),
});
export type DeliverableMeta = z.infer<typeof DeliverableMetaSchema>;

export const ProtectedListResponseSchema = z.object({ data: z.array(ContractJobSchema), next: z.string().nullable() });
export type ProtectedListResponse = z.infer<typeof ProtectedListResponseSchema>;

export const ProtectedDetailSchema = z.object({
  job: ContractJobSchema,
  /** Null when the criteria blob is not stored here or does not match criteria_hash. */
  criteria: CriteriaDocSchema.nullable(),
  criteria_verified: z.boolean(),
  deliverable_meta: DeliverableMetaSchema.nullable(),
  jury: z.array(JurorViewSchema),
  explorer: z.object({ contract: z.string() }),
});
export type ProtectedDetail = z.infer<typeof ProtectedDetailSchema>;

export const ProtectedEvidenceSchema = EvidenceSchema;

export const VerifierViewSchema = z.object({
  account_id: z.string(),
  /** Model of this verifier's latest stored evidence; falls back to the registered label. */
  model: z.string(),
  provider: z.string().nullable(),
  /** model_label as registered on chain (may predate a model switch). */
  registered_label: z.string(),
  last_judged_at: z.string().nullable(),
  /** At least one of its stored evidence blobs carries a valid TEE attestation. */
  attested: z.boolean(),
  active: z.boolean(),
  stake: U128,
  stats: z.object({ votes: z.number(), majority_agreements: z.number(), missed_reveals: z.number(), earned: U128 }),
  /** Native balance of the verifier account (pays commit/reveal gas); null when unknown. */
  balance: U128.nullable(),
  allowance_status: z.enum(["ok", "low", "unknown"]),
});
export type VerifierView = z.infer<typeof VerifierViewSchema>;
export const VerifiersResponseSchema = z.object({ data: z.array(VerifierViewSchema) });
export type VerifiersResponse = z.infer<typeof VerifiersResponseSchema>;

export const TreasuryResponseSchema = z.object({
  treasury: U128,
  total_fee: U128,
  total_jury_pool: U128,
  settled_jobs: z.number(),
  params: ContractParamsSchema.nullable(),
});
export type TreasuryResponse = z.infer<typeof TreasuryResponseSchema>;
