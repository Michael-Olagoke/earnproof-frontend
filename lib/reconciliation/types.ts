/**
 * Contract state digest comparison types.
 *
 * Defines versioned digest structures, comparison results, freshness tracking,
 * and error conditions for the reconciliation tool.
 */

/**
 * Supported digest versions.
 * Only v1 is currently recognized. Unknown versions fail closed.
 */
export type DigestVersion = "v1";

/**
 * Supported algorithms in digest v1.
 * Only SHA-256 is supported; other algorithms fail closed.
 */
export type DigestAlgorithm = "SHA-256";

/**
 * Network identifier for contract state.
 */
export type NetworkIdentifier = "testnet" | "public";

/**
 * Contract state digest v1 schema.
 *
 * Represents the on-chain state of a contract decomposed into
 * meaningful components, each with its own digest.
 */
export interface ContractStateDigestV1 {
  version: "v1";
  algorithm: "SHA-256";
  contractAddress: string;
  network: NetworkIdentifier;
  asOfTimestamp: string; // ISO 8601 UTC
  components: {
    issuerRegistryState: string; // hex digest of issuer registry
    proofCommitmentState: string; // hex digest of proof commitments
    revocationState: string; // hex digest of revocation entries
    protocolConfig: string; // hex digest of protocol configuration
  };
  aggregateDigest: string; // SHA-256 of all component digests combined
}

/**
 * Union type for versioned contract state digests.
 * Currently only v1, but extensible for future versions.
 */
export type ContractStateDigest = ContractStateDigestV1;

/**
 * Backend projection of contract state.
 *
 * Represents the backend's view of what the contract state should be,
 * including when that projection was last computed.
 */
export interface BackendContractStateProjection {
  contractAddress: string;
  network: NetworkIdentifier;
  projectionAsOf: string; // ISO 8601 UTC
  expectedDigest: ContractStateDigest;
}

/**
 * Individual component comparison result.
 */
export interface ComponentComparison {
  name: string; // "issuerRegistryState", "proofCommitmentState", etc.
  backendDigest: string; // hex
  liveDigest: string; // hex
  status: "match" | "mismatch";
  fetchedAt: string; // ISO 8601 UTC
}

/**
 * Detail of a detected mismatch.
 */
export interface MismatchDetail {
  component: string;
  backendDigest: string;
  liveDigest: string;
  reason?: string;
}

/**
 * Freshness information for backend projection and live digest.
 */
export interface FreshnessInfo {
  backendProjectionAsOf: string; // ISO 8601 UTC
  backendProjectionAge: number; // milliseconds
  liveDigestFetchedAt: string; // ISO 8601 UTC
  liveDigestAge: number; // milliseconds
  isBackendStale: boolean; // true if > 60s old
  isLiveDigestStale: boolean; // true if > 30s old
}

/**
 * Overall status of the comparison.
 */
export type ComparisonStatus = "all-match" | "some-mismatch" | "error";

/**
 * Error details when comparison fails.
 */
export interface ComparisonError {
  code:
    | "UNSUPPORTED_DIGEST_VERSION"
    | "CONTRACT_IDENTITY_MISMATCH"
    | "NETWORK_MISMATCH"
    | "DIGEST_FETCH_FAILED"
    | "BACKEND_PROJECTION_FETCH_FAILED"
    | "AUTHORIZATION_DENIED"
    | "UNKNOWN_ERROR";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Result of a single contract state digest comparison.
 *
 * Contains component-level comparisons, freshness info, and any detected mismatches.
 */
export interface ContractStateComparisonResult {
  requestId: string; // UUID for deduplication/replay detection
  timestamp: string; // ISO 8601 UTC when comparison was performed
  network: NetworkIdentifier;
  contractAddress: string;
  digestVersion: DigestVersion;
  componentComparisons: ComponentComparison[];
  overallStatus: ComparisonStatus;
  mismatches: MismatchDetail[];
  freshness: FreshnessInfo;
  error?: ComparisonError;
}

/**
 * Mismatch export data (JSON or CSV).
 *
 * Contains only non-sensitive comparison results suitable for
 * offline review. Never includes private keys, wallet material, or secrets.
 */
export interface MismatchExportData {
  requestId: string;
  timestamp: string;
  network: NetworkIdentifier;
  contractAddress: string;
  digestVersion: DigestVersion;
  componentComparisons: ComponentComparison[];
  freshness: FreshnessInfo;
}

/**
 * Export format selection.
 */
export type ExportFormat = "json" | "csv";

/**
 * Operator's input for network and contract selection.
 */
export interface ReconciliationInput {
  network: NetworkIdentifier;
  contractAddress: string;
}

/**
 * List of known contracts available for selection.
 */
export interface AvailableContractInfo {
  address: string;
  network: NetworkIdentifier;
  name?: string;
  description?: string;
}

/**
 * Session user with role information.
 */
export interface SessionUser {
  id: string;
  role: "WORKER" | "ISSUER" | "ADMIN" | "DEVELOPER";
  walletAddress: string;
  walletHash: string;
}

/**
 * Session data including authentication and user info.
 */
export interface SessionData {
  token: string;
  user: SessionUser;
}

/**
 * State of the reconciliation comparison component.
 */
export interface ReconciliationComponentState {
  selectedNetwork: NetworkIdentifier | null;
  selectedContractAddress: string | null;
  availableContracts: AvailableContractInfo[];
  isLoading: boolean;
  error: ComparisonError | null;
  result: ContractStateComparisonResult | null;
  lastComparisonKey: string | null; // cache key for replay detection
  lastComparisonTime: number | null; // timestamp for cache freshness
}
