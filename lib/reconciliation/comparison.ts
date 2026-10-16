/**
 * Contract state digest comparison logic.
 *
 * Implements component-level comparison, freshness tracking,
 * and error detection for the reconciliation tool.
 */

import type {
  ContractStateDigest,
  BackendContractStateProjection,
  ContractStateComparisonResult,
  ComponentComparison,
  MismatchDetail,
  FreshnessInfo,
} from "@/lib/reconciliation/types";
import {
  validateNetworkConsistency,
  validateContractConsistency,
} from "@/lib/validation/reconciliation";

/**
 * Staleness thresholds (milliseconds).
 */
const BACKEND_PROJECTION_STALENESS_THRESHOLD_MS = 60000; // 60 seconds
const LIVE_DIGEST_STALENESS_THRESHOLD_MS = 30000; // 30 seconds

/**
 * Comparison error: unsupported digest version.
 */
export function createUnsupportedVersionError(version: string) {
  return {
    code: "UNSUPPORTED_DIGEST_VERSION" as const,
    message: `Digest version "${version}" is not supported by this tool. Only v1 is recognized.`,
    details: {
      receivedVersion: version,
      supportedVersions: ["v1"],
    },
  };
}

/**
 * Comparison error: contract identity mismatch.
 */
export function createContractMismatchError(
  selectedAddress: string,
  backendAddress: string,
) {
  return {
    code: "CONTRACT_IDENTITY_MISMATCH" as const,
    message: `Selected contract ${selectedAddress} does not match backend projection target ${backendAddress}. Please verify network and contract selection.`,
    details: {
      selectedContract: selectedAddress,
      backendContract: backendAddress,
    },
  };
}

/**
 * Comparison error: network mismatch.
 */
export function createNetworkMismatchError(
  selectedNetwork: string,
  backendNetwork: string,
) {
  return {
    code: "NETWORK_MISMATCH" as const,
    message: `Selected network ${selectedNetwork} does not match backend projection network ${backendNetwork}.`,
    details: {
      selectedNetwork,
      backendNetwork,
    },
  };
}

/**
 * Calculate freshness information for both sides of the comparison.
 *
 * @param backendProjectionAsOf - ISO 8601 timestamp when backend projection was computed
 * @param liveDigestFetchedAt - ISO 8601 timestamp when live digest was fetched
 * @param nowTimestamp - Current timestamp for age calculation (allows testing with fixed times)
 * @returns Freshness info including age and staleness status
 */
export function calculateFreshness(
  backendProjectionAsOf: string,
  liveDigestFetchedAt: string,
  nowTimestamp: string = new Date().toISOString(),
): FreshnessInfo {
  const now = new Date(nowTimestamp).getTime();
  const backendTime = new Date(backendProjectionAsOf).getTime();
  const liveTime = new Date(liveDigestFetchedAt).getTime();

  const backendAge = Math.max(0, now - backendTime);
  const liveAge = Math.max(0, now - liveTime);

  return {
    backendProjectionAsOf,
    backendProjectionAge: backendAge,
    liveDigestFetchedAt,
    liveDigestAge: liveAge,
    isBackendStale: backendAge > BACKEND_PROJECTION_STALENESS_THRESHOLD_MS,
    isLiveDigestStale: liveAge > LIVE_DIGEST_STALENESS_THRESHOLD_MS,
  };
}

/**
 * Compare a single component's digests.
 *
 * @param name - Component name
 * @param backendDigest - Backend's expected digest value
 * @param liveDigest - Live on-chain digest value
 * @param fetchedAt - When the live digest was fetched
 * @returns Component comparison result
 */
function compareComponent(
  name: string,
  backendDigest: string,
  liveDigest: string,
  fetchedAt: string,
): ComponentComparison {
  const status =
    backendDigest.toLowerCase() === liveDigest.toLowerCase()
      ? "match"
      : "mismatch";

  return {
    name,
    backendDigest: backendDigest.toLowerCase(),
    liveDigest: liveDigest.toLowerCase(),
    status,
    fetchedAt,
  };
}

/**
 * Compare all components in the digest and identify mismatches.
 *
 * @param backendDigest - Backend's expected digest
 * @param liveDigest - Live on-chain digest
 * @param nowTimestamp - Current timestamp for age calculation
 * @returns Component comparisons and mismatch details
 */
function compareAllComponents(
  backendDigest: ContractStateDigest,
  liveDigest: ContractStateDigest,
  nowTimestamp: string,
): {
  comparisons: ComponentComparison[];
  mismatches: MismatchDetail[];
} {
  const comparisons: ComponentComparison[] = [];
  const mismatches: MismatchDetail[] = [];

  // Get list of component names from backend digest
  const componentNames = Object.keys(
    backendDigest.components,
  ) as Array<keyof typeof backendDigest.components>;

  for (const name of componentNames) {
    const backendValue = backendDigest.components[name];
    const liveValue = liveDigest.components[name];

    const comparison = compareComponent(
      name,
      backendValue,
      liveValue,
      nowTimestamp,
    );

    comparisons.push(comparison);

    if (comparison.status === "mismatch") {
      mismatches.push({
        component: name,
        backendDigest: comparison.backendDigest,
        liveDigest: comparison.liveDigest,
      });
    }
  }

  return { comparisons, mismatches };
}

/**
 * Generate a UUID v4 string for request tracking.
 *
 * Uses the Web Crypto API (available in browser and Node.js).
 */
function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version to 4 and variant to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Perform full contract state digest comparison.
 *
 * Validates inputs, compares components, calculates freshness,
 * and detects errors. Returns a complete comparison result suitable
 * for display and export.
 *
 * @param selectedNetwork - Network selected by operator
 * @param selectedContractAddress - Contract selected by operator
 * @param backendProjection - Backend's projected state
 * @param liveDigest - Live on-chain digest
 * @param nowTimestamp - Current timestamp for age calculation (allows testing)
 * @returns Complete comparison result with all details
 */
export function performComparisonV1(
  selectedNetwork: string,
  selectedContractAddress: string,
  backendProjection: BackendContractStateProjection,
  liveDigest: ContractStateDigest,
  nowTimestamp: string = new Date().toISOString(),
): ContractStateComparisonResult {
  const requestId = generateRequestId();
  const timestamp = nowTimestamp;

  // Validate digest version
  if (liveDigest.version !== "v1") {
    return {
      requestId,
      timestamp,
      network: selectedNetwork as any,
      contractAddress: selectedContractAddress,
      digestVersion: "v1",
      componentComparisons: [],
      overallStatus: "error",
      mismatches: [],
      freshness: calculateFreshness(
        backendProjection.projectionAsOf,
        timestamp,
        nowTimestamp,
      ),
      error: createUnsupportedVersionError(liveDigest.version),
    };
  }

  // Validate network consistency
  const networkError = validateNetworkConsistency(
    selectedNetwork,
    backendProjection.network,
  );
  if (networkError) {
    return {
      requestId,
      timestamp,
      network: selectedNetwork as any,
      contractAddress: selectedContractAddress,
      digestVersion: "v1",
      componentComparisons: [],
      overallStatus: "error",
      mismatches: [],
      freshness: calculateFreshness(
        backendProjection.projectionAsOf,
        timestamp,
        nowTimestamp,
      ),
      error: {
        code: "NETWORK_MISMATCH",
        message: networkError,
        details: {
          selectedNetwork,
          backendNetwork: backendProjection.network,
        },
      },
    };
  }

  // Validate contract consistency
  const contractError = validateContractConsistency(
    selectedContractAddress,
    backendProjection.contractAddress,
  );
  if (contractError) {
    return {
      requestId,
      timestamp,
      network: selectedNetwork as any,
      contractAddress: selectedContractAddress,
      digestVersion: "v1",
      componentComparisons: [],
      overallStatus: "error",
      mismatches: [],
      freshness: calculateFreshness(
        backendProjection.projectionAsOf,
        timestamp,
        nowTimestamp,
      ),
      error: {
        code: "CONTRACT_IDENTITY_MISMATCH",
        message: contractError,
        details: {
          selectedContract: selectedContractAddress,
          backendContract: backendProjection.contractAddress,
        },
      },
    };
  }

  // Perform component-level comparison
  const { comparisons, mismatches } = compareAllComponents(
    backendProjection.expectedDigest,
    liveDigest,
    timestamp,
  );

  // Determine overall status
  const overallStatus = mismatches.length === 0 ? "all-match" : "some-mismatch";

  // Calculate freshness
  const freshness = calculateFreshness(
    backendProjection.projectionAsOf,
    timestamp,
    nowTimestamp,
  );

  return {
    requestId,
    timestamp,
    network: backendProjection.network,
    contractAddress: backendProjection.contractAddress,
    digestVersion: "v1",
    componentComparisons: comparisons,
    overallStatus,
    mismatches,
    freshness,
  };
}
