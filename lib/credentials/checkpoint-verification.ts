/**
 * Revocation checkpoint verification and freshness comparison (#293).
 *
 * Provides utilities to compare a checkpoint from a verification result against
 * the current live contract state, determining if the revocation data the result
 * relied on is still fresh or has become stale as the contract has advanced.
 *
 * Checkpoint freshness is **purely informational context** — it must never
 * override, hide, or soften the underlying cryptographic proof-validity result.
 * The original verification result (valid/invalid) stands on its own; this
 * checkpoint UI layers atop it as supplementary human-readable context.
 */

/**
 * A checkpoint representing a point-in-time snapshot of the revocation state
 * used to verify that a credential was not revoked at that time.
 */
export type Checkpoint = {
  /** Merkle tree sequence number at this checkpoint */
  sequence: number;
  /** Merkle root hash (hex-encoded) */
  root: string;
  /** Hash algorithm used (e.g., "SHA-256", "KECCAK-256") */
  algorithm: string;
  /** Chain ledger/block identifier this checkpoint corresponds to */
  ledger: string;
  /** ISO 8601 timestamp when this checkpoint was fetched/recorded */
  observedAt: string;
};

/**
 * Freshness comparison result, exactly one state per comparison.
 * Never merge COMPARISON_FAILED into STALE — they are distinct outcomes
 * requiring different error handling and UI presentation.
 */
export type FreshnessState = "FRESH" | "STALE" | "COMPARISON_FAILED";

export type CheckpointFreshnessResult =
  | {
      state: "FRESH";
      proofCheckpoint: Checkpoint;
      liveCheckpoint: Checkpoint;
    }
  | {
      state: "STALE";
      proofCheckpoint: Checkpoint;
      liveCheckpoint: Checkpoint;
      sequencesBehind: number;
    }
  | {
      state: "COMPARISON_FAILED";
      reason:
        | "fetch-error"
        | "unsupported-algorithm"
        | "unauthorized"
        | "malformed-response"
        | "missing-proof-checkpoint";
      details?: string;
    };

/**
 * Supported checkpoint algorithms. Only these algorithms are accepted.
 * Any other algorithm fails closed (COMPARISON_FAILED), not silently downgraded.
 */
export const SUPPORTED_CHECKPOINT_ALGORITHMS: readonly string[] = ["SHA-256", "KECCAK-256"];

export function isSupportedAlgorithm(algorithm: string): boolean {
  return SUPPORTED_CHECKPOINT_ALGORITHMS.includes(algorithm);
}

/**
 * Compares a checkpoint from a proof's verification result against the
 * current live contract state checkpoint.
 *
 * Returns one of three distinct states:
 * - FRESH: Checkpoint sequence/root match current state
 * - STALE: Checkpoint sequence is behind current state (contract has advanced)
 * - COMPARISON_FAILED: Fetch error, unsupported algorithm, or authorization denied
 *
 * Boundary conditions (deterministic):
 * - Exact sequence match → FRESH
 * - Sequence exactly 1 behind → STALE
 * - Sequence 2+ behind → STALE (no distinction by degree)
 */
export function compareCheckpoints(
  proofCheckpoint: Checkpoint | null | undefined,
  liveCheckpoint: Checkpoint | null | undefined,
): CheckpointFreshnessResult {
  // Missing proof checkpoint: cannot compare
  if (!proofCheckpoint) {
    return {
      state: "COMPARISON_FAILED",
      reason: "missing-proof-checkpoint",
      details: "Proof verification result does not include checkpoint data",
    };
  }

  // Missing live checkpoint: fetch likely failed
  if (!liveCheckpoint) {
    return {
      state: "COMPARISON_FAILED",
      reason: "fetch-error",
      details: "Unable to fetch current contract state checkpoint",
    };
  }

  // Unsupported algorithm: fail closed
  if (!isSupportedAlgorithm(proofCheckpoint.algorithm)) {
    return {
      state: "COMPARISON_FAILED",
      reason: "unsupported-algorithm",
      details: `Algorithm "${proofCheckpoint.algorithm}" is not supported`,
    };
  }

  if (!isSupportedAlgorithm(liveCheckpoint.algorithm)) {
    return {
      state: "COMPARISON_FAILED",
      reason: "unsupported-algorithm",
      details: `Live checkpoint algorithm "${liveCheckpoint.algorithm}" is not supported`,
    };
  }

  // Malformed data: invalid sequences
  if (
    typeof proofCheckpoint.sequence !== "number" ||
    typeof liveCheckpoint.sequence !== "number" ||
    !Number.isInteger(proofCheckpoint.sequence) ||
    !Number.isInteger(liveCheckpoint.sequence) ||
    proofCheckpoint.sequence < 0 ||
    liveCheckpoint.sequence < 0
  ) {
    return {
      state: "COMPARISON_FAILED",
      reason: "malformed-response",
      details: "Invalid checkpoint sequence numbers",
    };
  }

  // Comparison logic: deterministic boundary handling
  if (proofCheckpoint.sequence === liveCheckpoint.sequence) {
    // Exact match: FRESH
    return {
      state: "FRESH",
      proofCheckpoint,
      liveCheckpoint,
    };
  } else if (proofCheckpoint.sequence < liveCheckpoint.sequence) {
    // Behind: STALE (treat all gaps uniformly, no distinction by degree)
    const sequencesBehind = liveCheckpoint.sequence - proofCheckpoint.sequence;
    return {
      state: "STALE",
      proofCheckpoint,
      liveCheckpoint,
      sequencesBehind,
    };
  } else {
    // Proof checkpoint ahead of live (unusual, but treat as COMPARISON_FAILED)
    return {
      state: "COMPARISON_FAILED",
      reason: "malformed-response",
      details: "Proof checkpoint sequence is ahead of current contract state",
    };
  }
}

/**
 * Helper to format a freshness state for human display.
 */
export function formatFreshnessState(state: FreshnessState): string {
  switch (state) {
    case "FRESH":
      return "Fresh";
    case "STALE":
      return "Stale";
    case "COMPARISON_FAILED":
      return "Comparison unavailable";
  }
}

/**
 * Helper to get a user-facing message for a freshness comparison failure reason.
 */
export function formatComparisonFailureReason(
  reason: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" },
): string {
  switch (reason.reason) {
    case "fetch-error":
      return "Unable to fetch current contract state";
    case "unsupported-algorithm":
      return "Algorithm not supported";
    case "unauthorized":
      return "Insufficient permissions to view checkpoint";
    case "malformed-response":
      return "Invalid response format";
    case "missing-proof-checkpoint":
      return "Checkpoint data not available for this proof";
  }
}

/**
 * Type guard: is this result a FRESH state?
 */
export function isFresh(result: CheckpointFreshnessResult): result is CheckpointFreshnessResult & { state: "FRESH" } {
  return result.state === "FRESH";
}

/**
 * Type guard: is this result a STALE state?
 */
export function isStale(result: CheckpointFreshnessResult): result is CheckpointFreshnessResult & { state: "STALE" } {
  return result.state === "STALE";
}

/**
 * Type guard: is this result a COMPARISON_FAILED state?
 */
export function isComparisonFailed(
  result: CheckpointFreshnessResult,
): result is CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } {
  return result.state === "COMPARISON_FAILED";
}

/**
 * Truncate a hash for display: show first 16 chars + "..." + last 8 chars.
 * E.g., "a1b2c3d4e5f6g7h8...i9j0k1l2m3n4" for a 32-char hash.
 */
export function truncateHash(hash: string, displayLength: number = 16, endLength: number = 8): string {
  if (hash.length <= displayLength + endLength + 3) {
    // Hash too short to truncate meaningfully
    return hash;
  }
  const start = hash.substring(0, displayLength);
  const end = hash.substring(hash.length - endLength);
  return `${start}...${end}`;
}

/**
 * Get the full hash for copying (not truncated).
 */
export function getFullHash(hash: string): string {
  return hash;
}
