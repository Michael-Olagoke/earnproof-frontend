/**
 * Synthetic test fixtures for reconciliation/digest comparison tool.
 *
 * All fixtures use synthetic data only - no real wallet material, private proofs,
 * or production credentials. Timestamps are fixed ISO strings for determinism.
 */

import type {
  ContractStateDigestV1,
  BackendContractStateProjection,
  ContractStateComparisonResult,
  MismatchExportData,
  AvailableContractInfo,
} from "@/lib/reconciliation/types";

/**
 * Fixed reference timestamp for all fixtures.
 * All derived timestamps are relative to this moment.
 */
const FIXTURE_REFERENCE_TIME = "2026-10-16T14:30:00Z";

/**
 * Mock contract address (valid format, synthetic).
 */
export const MOCK_CONTRACT_ADDRESS =
  "CBDE4723EB188743EA6FA31B25670131D592375F35E7997F19A8FB0F635CFFC7C";

/**
 * Alternative contract address for mismatch testing.
 */
export const MOCK_ALTERNATIVE_CONTRACT_ADDRESS =
  "CABC0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

/**
 * Mock hex digest (64 lowercase hex characters, SHA-256 format).
 */
export const MOCK_DIGEST_1 =
  "aabbccddeeff001122334455667788991010111213141516171819202122232425";

/**
 * Alternative mock digest for mismatch testing.
 */
export const MOCK_DIGEST_2 =
  "1122334455667788991010111213141516171819202122232425aabbccddee";

/**
 * Matching digests for all components (all-match test case).
 */
export const MOCK_MATCHING_DIGEST_SET = {
  issuerRegistryState: MOCK_DIGEST_1,
  proofCommitmentState: MOCK_DIGEST_1,
  revocationState: MOCK_DIGEST_1,
  protocolConfig: MOCK_DIGEST_1,
};

/**
 * Mismatched digest for issuerRegistryState only (single-mismatch test case).
 */
export const MOCK_MISMATCHED_DIGEST_SET = {
  issuerRegistryState: MOCK_DIGEST_2,
  proofCommitmentState: MOCK_DIGEST_1,
  revocationState: MOCK_DIGEST_1,
  protocolConfig: MOCK_DIGEST_1,
};

/**
 * Contract state digest v1 - all components matching.
 */
export const MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING: ContractStateDigestV1 = {
  version: "v1",
  algorithm: "SHA-256",
  contractAddress: MOCK_CONTRACT_ADDRESS,
  network: "testnet",
  asOfTimestamp: FIXTURE_REFERENCE_TIME,
  components: MOCK_MATCHING_DIGEST_SET,
  aggregateDigest: MOCK_DIGEST_1,
};

/**
 * Contract state digest v1 - single component mismatch (issuerRegistryState).
 */
export const MOCK_CONTRACT_STATE_DIGEST_V1_MISMATCHED: ContractStateDigestV1 =
  {
    version: "v1",
    algorithm: "SHA-256",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    network: "testnet",
    asOfTimestamp: FIXTURE_REFERENCE_TIME,
    components: MOCK_MISMATCHED_DIGEST_SET,
    aggregateDigest: MOCK_DIGEST_2,
  };

/**
 * Contract state digest v1 - public network.
 */
export const MOCK_CONTRACT_STATE_DIGEST_V1_PUBLIC: ContractStateDigestV1 = {
  version: "v1",
  algorithm: "SHA-256",
  contractAddress: MOCK_CONTRACT_ADDRESS,
  network: "public",
  asOfTimestamp: FIXTURE_REFERENCE_TIME,
  components: MOCK_MATCHING_DIGEST_SET,
  aggregateDigest: MOCK_DIGEST_1,
};

/**
 * Backend projection - matching all components (fresh).
 */
export const MOCK_BACKEND_PROJECTION_MATCHING: BackendContractStateProjection =
  {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    network: "testnet",
    projectionAsOf: FIXTURE_REFERENCE_TIME,
    expectedDigest: MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
  };

/**
 * Backend projection - mismatched issuerRegistryState (fresh).
 */
export const MOCK_BACKEND_PROJECTION_MISMATCHED: BackendContractStateProjection =
  {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    network: "testnet",
    projectionAsOf: FIXTURE_REFERENCE_TIME,
    expectedDigest: MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
  };

/**
 * Backend projection - stale (70 seconds old).
 */
export const MOCK_BACKEND_PROJECTION_STALE: BackendContractStateProjection = {
  contractAddress: MOCK_CONTRACT_ADDRESS,
  network: "testnet",
  projectionAsOf: "2026-10-16T14:28:50Z", // 70 seconds before reference time
  expectedDigest: MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
};

/**
 * Comparison result - all components match.
 */
export const MOCK_COMPARISON_RESULT_ALL_MATCH: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [
      {
        name: "issuerRegistryState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "proofCommitmentState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "revocationState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "protocolConfig",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
    ],
    overallStatus: "all-match",
    mismatches: [],
    freshness: {
      backendProjectionAsOf: FIXTURE_REFERENCE_TIME,
      backendProjectionAge: 0,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: false,
      isLiveDigestStale: false,
    },
  };

/**
 * Comparison result - single component mismatch (issuerRegistryState).
 */
export const MOCK_COMPARISON_RESULT_SINGLE_MISMATCH: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440001",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [
      {
        name: "issuerRegistryState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_2,
        status: "mismatch",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "proofCommitmentState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "revocationState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "protocolConfig",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
    ],
    overallStatus: "some-mismatch",
    mismatches: [
      {
        component: "issuerRegistryState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_2,
      },
    ],
    freshness: {
      backendProjectionAsOf: FIXTURE_REFERENCE_TIME,
      backendProjectionAge: 0,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: false,
      isLiveDigestStale: false,
    },
  };

/**
 * Comparison result - error condition (unsupported digest version).
 */
export const MOCK_COMPARISON_RESULT_UNSUPPORTED_VERSION: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440002",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [],
    overallStatus: "error",
    mismatches: [],
    freshness: {
      backendProjectionAsOf: FIXTURE_REFERENCE_TIME,
      backendProjectionAge: 0,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: false,
      isLiveDigestStale: false,
    },
    error: {
      code: "UNSUPPORTED_DIGEST_VERSION",
      message:
        "Digest version v2 is not supported by this tool version. Please update.",
      details: {
        receivedVersion: "v2",
        supportedVersions: ["v1"],
      },
    },
  };

/**
 * Comparison result - error condition (contract identity mismatch).
 */
export const MOCK_COMPARISON_RESULT_CONTRACT_MISMATCH: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440003",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [],
    overallStatus: "error",
    mismatches: [],
    freshness: {
      backendProjectionAsOf: FIXTURE_REFERENCE_TIME,
      backendProjectionAge: 0,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: false,
      isLiveDigestStale: false,
    },
    error: {
      code: "CONTRACT_IDENTITY_MISMATCH",
      message:
        "Selected contract does not match backend projection target. Backend is tracking " +
        MOCK_ALTERNATIVE_CONTRACT_ADDRESS +
        ". Please verify network and contract selection.",
      details: {
        selectedContract: MOCK_CONTRACT_ADDRESS,
        backendContract: MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
      },
    },
  };

/**
 * Comparison result - stale backend projection.
 */
export const MOCK_COMPARISON_RESULT_STALE_BACKEND: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440004",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [
      {
        name: "issuerRegistryState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "proofCommitmentState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "revocationState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "protocolConfig",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
    ],
    overallStatus: "all-match",
    mismatches: [],
    freshness: {
      backendProjectionAsOf: "2026-10-16T14:28:50Z", // 70 seconds old
      backendProjectionAge: 70000,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: true,
      isLiveDigestStale: false,
    },
  };

/**
 * Comparison result - at staleness boundary (exactly 60 seconds).
 */
export const MOCK_COMPARISON_RESULT_EXACTLY_AT_BOUNDARY: ContractStateComparisonResult =
  {
    requestId: "550e8400-e29b-41d4-a716-446655440005",
    timestamp: FIXTURE_REFERENCE_TIME,
    network: "testnet",
    contractAddress: MOCK_CONTRACT_ADDRESS,
    digestVersion: "v1",
    componentComparisons: [
      {
        name: "issuerRegistryState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "proofCommitmentState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "revocationState",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
      {
        name: "protocolConfig",
        backendDigest: MOCK_DIGEST_1,
        liveDigest: MOCK_DIGEST_1,
        status: "match",
        fetchedAt: FIXTURE_REFERENCE_TIME,
      },
    ],
    overallStatus: "all-match",
    mismatches: [],
    freshness: {
      backendProjectionAsOf: "2026-10-16T14:29:00Z", // exactly 60 seconds old
      backendProjectionAge: 60000,
      liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
      liveDigestAge: 0,
      isBackendStale: false, // exactly at threshold: NOT stale
      isLiveDigestStale: false,
    },
  };

/**
 * Mismatch export data.
 */
export const MOCK_MISMATCH_EXPORT_DATA: MismatchExportData = {
  requestId: "550e8400-e29b-41d4-a716-446655440001",
  timestamp: FIXTURE_REFERENCE_TIME,
  network: "testnet",
  contractAddress: MOCK_CONTRACT_ADDRESS,
  digestVersion: "v1",
  componentComparisons: [
    {
      name: "issuerRegistryState",
      backendDigest: MOCK_DIGEST_1,
      liveDigest: MOCK_DIGEST_2,
      status: "mismatch",
      fetchedAt: FIXTURE_REFERENCE_TIME,
    },
    {
      name: "proofCommitmentState",
      backendDigest: MOCK_DIGEST_1,
      liveDigest: MOCK_DIGEST_1,
      status: "match",
      fetchedAt: FIXTURE_REFERENCE_TIME,
    },
  ],
  freshness: {
    backendProjectionAsOf: FIXTURE_REFERENCE_TIME,
    backendProjectionAge: 0,
    liveDigestFetchedAt: FIXTURE_REFERENCE_TIME,
    liveDigestAge: 0,
    isBackendStale: false,
    isLiveDigestStale: false,
  },
};

/**
 * Available contracts for selection UI.
 */
export const MOCK_AVAILABLE_CONTRACTS: AvailableContractInfo[] = [
  {
    address: MOCK_CONTRACT_ADDRESS,
    network: "testnet",
    name: "Primary Issuer Registry",
    description: "Main issuer registry contract",
  },
  {
    address: MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
    network: "testnet",
    name: "Backup Registry",
    description: "Backup registry for DR testing",
  },
  {
    address: MOCK_CONTRACT_ADDRESS,
    network: "public",
    name: "Production Registry",
    description: "Live public network registry",
  },
];
