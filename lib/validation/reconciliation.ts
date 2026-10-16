/**
 * Validation schemas for reconciliation/digest comparison tool.
 *
 * Uses Zod for schema validation with custom domain-specific validators.
 * All input validation occurs before any API requests are made.
 */

import { z } from "zod";

/**
 * Network identifier validation.
 * Only "testnet" and "public" are recognized.
 */
export const networkIdentifierSchema = z
  .enum(["testnet", "public"])
  .describe("Stellar network identifier");

/**
 * Stellar contract address validation.
 * Must be a 56-character base32-encoded string starting with 'C'.
 */
export const contractAddressSchema = z
  .string()
  .min(1, "Contract address is required")
  .regex(
    /^C[A-Z2-7]{55}$/,
    "Invalid contract address format. Must be 56-character base32 string starting with C."
  )
  .describe("Stellar contract address");

/**
 * Reconciliation input validation.
 * Validates operator's network and contract selection.
 */
export const reconciliationInputSchema = z.object({
  network: networkIdentifierSchema,
  contractAddress: contractAddressSchema,
});

export type ReconciliationInput = z.infer<typeof reconciliationInputSchema>;

/**
 * User role validation for authorization.
 */
export const userRoleSchema = z.enum([
  "WORKER",
  "ISSUER",
  "ADMIN",
  "DEVELOPER",
]);

export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Check if a role is authorized to perform reconciliation operations.
 *
 * Only ADMIN and ISSUER roles are permitted.
 *
 * @param role - User role to check
 * @returns True if role is authorized, false otherwise
 */
export function isRoleAuthorizedForReconciliation(role: UserRole): boolean {
  return role === "ADMIN" || role === "ISSUER";
}

/**
 * Digest algorithm validation.
 * Only SHA-256 is supported in v1.
 */
export const digestAlgorithmSchema = z
  .enum(["SHA-256"])
  .describe("Supported digest algorithm");

/**
 * Digest version validation.
 * Only "v1" is currently recognized.
 */
export const digestVersionSchema = z
  .enum(["v1"])
  .describe("Supported digest version");

/**
 * ISO 8601 UTC timestamp validation.
 */
export const iso8601TimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    "Timestamp must be ISO 8601 UTC format (YYYY-MM-DDTHH:mm:ssZ)"
  )
  .describe("ISO 8601 UTC timestamp");

/**
 * Hex digest string validation.
 * Must be 64 lowercase hex characters (SHA-256 digest).
 */
export const hexDigestSchema = z
  .string()
  .regex(
    /^[0-9a-f]{64}$/,
    "Invalid digest format. Must be 64 lowercase hex characters."
  )
  .transform((val) => val.toLowerCase())
  .describe("SHA-256 hex digest");

/**
 * Contract state digest v1 schema.
 */
export const contractStateDigestV1Schema = z.object({
  version: digestVersionSchema,
  algorithm: digestAlgorithmSchema,
  contractAddress: contractAddressSchema,
  network: networkIdentifierSchema,
  asOfTimestamp: iso8601TimestampSchema,
  components: z.object({
    issuerRegistryState: hexDigestSchema,
    proofCommitmentState: hexDigestSchema,
    revocationState: hexDigestSchema,
    protocolConfig: hexDigestSchema,
  }),
  aggregateDigest: hexDigestSchema,
});

export type ContractStateDigestV1 = z.infer<typeof contractStateDigestV1Schema>;

/**
 * Backend contract state projection schema.
 */
export const backendContractStateProjectionSchema = z.object({
  contractAddress: contractAddressSchema,
  network: networkIdentifierSchema,
  projectionAsOf: iso8601TimestampSchema,
  expectedDigest: contractStateDigestV1Schema,
});

export type BackendContractStateProjection = z.infer<
  typeof backendContractStateProjectionSchema
>;

/**
 * Component comparison schema.
 */
export const componentComparisonSchema = z.object({
  name: z.string().min(1, "Component name is required"),
  backendDigest: hexDigestSchema,
  liveDigest: hexDigestSchema,
  status: z.enum(["match", "mismatch"]),
  fetchedAt: iso8601TimestampSchema,
});

export type ComponentComparison = z.infer<typeof componentComparisonSchema>;

/**
 * Mismatch detail schema.
 */
export const mismatchDetailSchema = z.object({
  component: z.string().min(1),
  backendDigest: hexDigestSchema,
  liveDigest: hexDigestSchema,
  reason: z.string().optional(),
});

export type MismatchDetail = z.infer<typeof mismatchDetailSchema>;

/**
 * Freshness information schema.
 */
export const freshnessInfoSchema = z.object({
  backendProjectionAsOf: iso8601TimestampSchema,
  backendProjectionAge: z.number().int().min(0),
  liveDigestFetchedAt: iso8601TimestampSchema,
  liveDigestAge: z.number().int().min(0),
  isBackendStale: z.boolean(),
  isLiveDigestStale: z.boolean(),
});

export type FreshnessInfo = z.infer<typeof freshnessInfoSchema>;

/**
 * Comparison error schema.
 */
export const comparisonErrorSchema = z.object({
  code: z.enum([
    "UNSUPPORTED_DIGEST_VERSION",
    "CONTRACT_IDENTITY_MISMATCH",
    "NETWORK_MISMATCH",
    "DIGEST_FETCH_FAILED",
    "BACKEND_PROJECTION_FETCH_FAILED",
    "AUTHORIZATION_DENIED",
    "UNKNOWN_ERROR",
  ]),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export type ComparisonError = z.infer<typeof comparisonErrorSchema>;

/**
 * Contract state comparison result schema.
 */
export const contractStateComparisonResultSchema = z.object({
  requestId: z.string().uuid(),
  timestamp: iso8601TimestampSchema,
  network: networkIdentifierSchema,
  contractAddress: contractAddressSchema,
  digestVersion: digestVersionSchema,
  componentComparisons: z.array(componentComparisonSchema),
  overallStatus: z.enum(["all-match", "some-mismatch", "error"]),
  mismatches: z.array(mismatchDetailSchema),
  freshness: freshnessInfoSchema,
  error: comparisonErrorSchema.optional(),
});

export type ContractStateComparisonResult = z.infer<
  typeof contractStateComparisonResultSchema
>;

/**
 * Mismatch export data schema.
 * Contains only non-sensitive data suitable for offline review.
 */
export const mismatchExportDataSchema = z.object({
  requestId: z.string().uuid(),
  timestamp: iso8601TimestampSchema,
  network: networkIdentifierSchema,
  contractAddress: contractAddressSchema,
  digestVersion: digestVersionSchema,
  componentComparisons: z.array(componentComparisonSchema),
  freshness: freshnessInfoSchema,
});

export type MismatchExportData = z.infer<typeof mismatchExportDataSchema>;

/**
 * Validate contract address format without API calls.
 * Used for client-side validation before submission.
 *
 * @param address - Contract address to validate
 * @returns null if valid, error message string if invalid
 */
export function validateContractAddressFormat(address: string): string | null {
  try {
    contractAddressSchema.parse(address);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues[0]?.message || "Invalid contract address";
    }
    return "Invalid contract address";
  }
}

/**
 * Validate that two digests represent the same network.
 *
 * @param backendDigest - Backend's digest
 * @param liveDigest - Live on-chain digest
 * @returns null if networks match, error message string if they don't
 */
export function validateNetworkConsistency(
  backendNetwork: string,
  liveNetwork: string
): string | null {
  if (backendNetwork !== liveNetwork) {
    return `Network mismatch: backend is on ${backendNetwork}, live digest is on ${liveNetwork}`;
  }
  return null;
}

/**
 * Validate that two digests represent the same contract.
 *
 * @param backendAddress - Backend's contract address
 * @param liveAddress - Live contract address
 * @returns null if addresses match, error message string if they don't
 */
export function validateContractConsistency(
  backendAddress: string,
  liveAddress: string
): string | null {
  if (backendAddress.toUpperCase() !== liveAddress.toUpperCase()) {
    return `Contract mismatch: backend is tracking ${backendAddress}, live digest is for ${liveAddress}`;
  }
  return null;
}
