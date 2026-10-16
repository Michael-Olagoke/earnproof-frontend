/**
 * Unit tests for checkpoint verification and freshness comparison logic (#293).
 *
 * Coverage includes:
 * - Boundary conditions (exact match, one behind, multiple behind)
 * - All three freshness states (FRESH, STALE, COMPARISON_FAILED)
 * - Failure modes (fetch error, unsupported algorithm, malformed data, unauthorized)
 * - Helper utilities (formatting, truncation, type guards)
 */

import {
  compareCheckpoints,
  formatFreshnessState,
  formatComparisonFailureReason,
  truncateHash,
  getFullHash,
  isFresh,
  isStale,
  isComparisonFailed,
  SUPPORTED_CHECKPOINT_ALGORITHMS,
  isSupportedAlgorithm,
  type Checkpoint,
  type CheckpointFreshnessResult,
} from "../checkpoint-verification";

describe("checkpoint-verification", () => {
  // Synthetic test fixtures
  const freshCheckpoint: Checkpoint = {
    sequence: 42,
    root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    algorithm: "SHA-256",
    ledger: "public",
    observedAt: "2026-10-16T12:00:00Z",
  };

  const staleCheckpoint: Checkpoint = {
    sequence: 40,
    root: "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6",
    algorithm: "SHA-256",
    ledger: "public",
    observedAt: "2026-10-16T11:50:00Z",
  };

  const advancedCheckpoint: Checkpoint = {
    sequence: 43,
    root: "p1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6",
    algorithm: "SHA-256",
    ledger: "public",
    observedAt: "2026-10-16T12:05:00Z",
  };

  describe("compareCheckpoints - Boundary Conditions", () => {
    it("returns FRESH when proof and live checkpoints have exact sequence match", () => {
      const result = compareCheckpoints(freshCheckpoint, freshCheckpoint);
      expect(result.state).toBe("FRESH");
      expect(isFresh(result)).toBe(true);
      expect(isStale(result)).toBe(false);
    });

    it("returns STALE when proof checkpoint is exactly one sequence behind", () => {
      const proofCheckpoint: Checkpoint = { ...freshCheckpoint, sequence: 42 };
      const liveCheckpoint: Checkpoint = { ...advancedCheckpoint, sequence: 43 };

      const result = compareCheckpoints(proofCheckpoint, liveCheckpoint);
      expect(result.state).toBe("STALE");
      expect(isStale(result)).toBe(true);
      if (isStale(result)) {
        expect(result.sequencesBehind).toBe(1);
      }
    });

    it("returns STALE when proof checkpoint is multiple sequences behind", () => {
      const proofCheckpoint: Checkpoint = { ...freshCheckpoint, sequence: 40 };
      const liveCheckpoint: Checkpoint = { ...advancedCheckpoint, sequence: 45 };

      const result = compareCheckpoints(proofCheckpoint, liveCheckpoint);
      expect(result.state).toBe("STALE");
      expect(isStale(result)).toBe(true);
      if (isStale(result)) {
        expect(result.sequencesBehind).toBe(5);
      }
    });

    it("returns STALE with sequencesBehind calculated correctly", () => {
      const result = compareCheckpoints(staleCheckpoint, freshCheckpoint);
      expect(result.state).toBe("STALE");
      if (isStale(result)) {
        expect(result.sequencesBehind).toBe(2);
      }
    });
  });

  describe("compareCheckpoints - Failure Modes", () => {
    it("returns COMPARISON_FAILED when proof checkpoint is missing", () => {
      const result = compareCheckpoints(null, freshCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      expect(isComparisonFailed(result)).toBe(true);
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("missing-proof-checkpoint");
      }
    });

    it("returns COMPARISON_FAILED when live checkpoint is missing", () => {
      const result = compareCheckpoints(freshCheckpoint, null);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("fetch-error");
      }
    });

    it("returns COMPARISON_FAILED when proof checkpoint algorithm is unsupported", () => {
      const unsupportedCheckpoint: Checkpoint = {
        ...freshCheckpoint,
        algorithm: "BLAKE3",
      };
      const result = compareCheckpoints(unsupportedCheckpoint, freshCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("unsupported-algorithm");
        expect(result.details).toContain("BLAKE3");
      }
    });

    it("returns COMPARISON_FAILED when live checkpoint algorithm is unsupported", () => {
      const unsupportedCheckpoint: Checkpoint = {
        ...freshCheckpoint,
        algorithm: "MD5",
      };
      const result = compareCheckpoints(freshCheckpoint, unsupportedCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("unsupported-algorithm");
      }
    });

    it("returns COMPARISON_FAILED when proof checkpoint sequence is invalid (negative)", () => {
      const invalidCheckpoint: Checkpoint = {
        ...freshCheckpoint,
        sequence: -1,
      };
      const result = compareCheckpoints(invalidCheckpoint, freshCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("malformed-response");
      }
    });

    it("returns COMPARISON_FAILED when live checkpoint sequence is invalid (float)", () => {
      const invalidCheckpoint = {
        ...freshCheckpoint,
        sequence: 42.5,
      };
      const result = compareCheckpoints(freshCheckpoint, invalidCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("malformed-response");
      }
    });

    it("returns COMPARISON_FAILED when proof checkpoint is ahead of live checkpoint", () => {
      const aheadCheckpoint: Checkpoint = {
        ...freshCheckpoint,
        sequence: 100,
      };
      const behindCheckpoint: Checkpoint = {
        ...freshCheckpoint,
        sequence: 50,
      };
      const result = compareCheckpoints(aheadCheckpoint, behindCheckpoint);
      expect(result.state).toBe("COMPARISON_FAILED");
      if (isComparisonFailed(result)) {
        expect(result.reason).toBe("malformed-response");
      }
    });

    it("returns COMPARISON_FAILED with undefined checkpoint (not just null)", () => {
      const result = compareCheckpoints(freshCheckpoint, undefined);
      expect(result.state).toBe("COMPARISON_FAILED");
    });
  });

  describe("compareCheckpoints - Fresh/Stale Inclusion", () => {
    it("FRESH result includes both proof and live checkpoint data", () => {
      const result = compareCheckpoints(freshCheckpoint, freshCheckpoint);
      expect(isFresh(result)).toBe(true);
      if (isFresh(result)) {
        expect(result.proofCheckpoint).toBe(freshCheckpoint);
        expect(result.liveCheckpoint).toBe(freshCheckpoint);
      }
    });

    it("STALE result includes both checkpoint data and sequencesBehind", () => {
      const result = compareCheckpoints(
        { ...freshCheckpoint, sequence: 40 },
        { ...advancedCheckpoint, sequence: 45 },
      );
      expect(isStale(result)).toBe(true);
      if (isStale(result)) {
        expect(result.proofCheckpoint.sequence).toBe(40);
        expect(result.liveCheckpoint.sequence).toBe(45);
        expect(result.sequencesBehind).toBe(5);
      }
    });
  });

  describe("formatFreshnessState", () => {
    it("formats FRESH state", () => {
      expect(formatFreshnessState("FRESH")).toBe("Fresh");
    });

    it("formats STALE state", () => {
      expect(formatFreshnessState("STALE")).toBe("Stale");
    });

    it("formats COMPARISON_FAILED state", () => {
      expect(formatFreshnessState("COMPARISON_FAILED")).toBe("Comparison unavailable");
    });
  });

  describe("formatComparisonFailureReason", () => {
    it("formats fetch-error reason", () => {
      const result: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } = {
        state: "COMPARISON_FAILED",
        reason: "fetch-error",
      };
      expect(formatComparisonFailureReason(result)).toContain("Unable to fetch");
    });

    it("formats unsupported-algorithm reason", () => {
      const result: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } = {
        state: "COMPARISON_FAILED",
        reason: "unsupported-algorithm",
      };
      expect(formatComparisonFailureReason(result)).toContain("Algorithm");
    });

    it("formats unauthorized reason", () => {
      const result: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } = {
        state: "COMPARISON_FAILED",
        reason: "unauthorized",
      };
      expect(formatComparisonFailureReason(result)).toContain("permissions");
    });

    it("formats malformed-response reason", () => {
      const result: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } = {
        state: "COMPARISON_FAILED",
        reason: "malformed-response",
      };
      expect(formatComparisonFailureReason(result)).toContain("Invalid");
    });

    it("formats missing-proof-checkpoint reason", () => {
      const result: CheckpointFreshnessResult & { state: "COMPARISON_FAILED" } = {
        state: "COMPARISON_FAILED",
        reason: "missing-proof-checkpoint",
      };
      expect(formatComparisonFailureReason(result)).toContain("not available");
    });
  });

  describe("Type guards", () => {
    it("isFresh returns true only for FRESH state", () => {
      const freshResult = compareCheckpoints(freshCheckpoint, freshCheckpoint);
      const staleResult = compareCheckpoints(staleCheckpoint, freshCheckpoint);
      const failedResult = compareCheckpoints(null, freshCheckpoint);

      expect(isFresh(freshResult)).toBe(true);
      expect(isFresh(staleResult)).toBe(false);
      expect(isFresh(failedResult)).toBe(false);
    });

    it("isStale returns true only for STALE state", () => {
      const freshResult = compareCheckpoints(freshCheckpoint, freshCheckpoint);
      const staleResult = compareCheckpoints(staleCheckpoint, freshCheckpoint);
      const failedResult = compareCheckpoints(null, freshCheckpoint);

      expect(isStale(freshResult)).toBe(false);
      expect(isStale(staleResult)).toBe(true);
      expect(isStale(failedResult)).toBe(false);
    });

    it("isComparisonFailed returns true only for COMPARISON_FAILED state", () => {
      const freshResult = compareCheckpoints(freshCheckpoint, freshCheckpoint);
      const staleResult = compareCheckpoints(staleCheckpoint, freshCheckpoint);
      const failedResult = compareCheckpoints(null, freshCheckpoint);

      expect(isComparisonFailed(freshResult)).toBe(false);
      expect(isComparisonFailed(staleResult)).toBe(false);
      expect(isComparisonFailed(failedResult)).toBe(true);
    });
  });

  describe("Hash truncation", () => {
    it("truncates long hash to display format", () => {
      const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
      const truncated = truncateHash(hash);
      expect(truncated).toBe("a1b2c3d4e5f6g7h8...s9t0");
    });

    it("returns full hash when too short to truncate", () => {
      const shortHash = "abcd1234";
      const truncated = truncateHash(shortHash);
      expect(truncated).toBe("abcd1234");
    });

    it("respects custom display and end lengths", () => {
      const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2";
      const truncated = truncateHash(hash, 12, 10);
      expect(truncated).toBe("a1b2c3d4e5f6...c9d0e1f2");
    });

    it("getFullHash returns untruncated hash", () => {
      const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      expect(getFullHash(hash)).toBe(hash);
    });
  });

  describe("Algorithm support", () => {
    it("recognizes SHA-256 as supported", () => {
      expect(isSupportedAlgorithm("SHA-256")).toBe(true);
    });

    it("recognizes KECCAK-256 as supported", () => {
      expect(isSupportedAlgorithm("KECCAK-256")).toBe(true);
    });

    it("rejects unsupported algorithms", () => {
      expect(isSupportedAlgorithm("MD5")).toBe(false);
      expect(isSupportedAlgorithm("SHA-1")).toBe(false);
      expect(isSupportedAlgorithm("BLAKE3")).toBe(false);
    });

    it("includes expected algorithms in SUPPORTED_CHECKPOINT_ALGORITHMS", () => {
      expect(SUPPORTED_CHECKPOINT_ALGORITHMS).toContain("SHA-256");
      expect(SUPPORTED_CHECKPOINT_ALGORITHMS).toContain("KECCAK-256");
    });
  });

  describe("Edge cases", () => {
    it("handles checkpoints with identical data except sequence", () => {
      const checkpoint1 = { ...freshCheckpoint, sequence: 40 };
      const checkpoint2 = { ...freshCheckpoint, sequence: 40 };
      const result = compareCheckpoints(checkpoint1, checkpoint2);
      expect(isFresh(result)).toBe(true);
    });

    it("handles very large sequence numbers", () => {
      const checkpoint1: Checkpoint = { ...freshCheckpoint, sequence: 1000000 };
      const checkpoint2: Checkpoint = { ...freshCheckpoint, sequence: 1000001 };
      const result = compareCheckpoints(checkpoint1, checkpoint2);
      expect(isStale(result)).toBe(true);
      if (isStale(result)) {
        expect(result.sequencesBehind).toBe(1);
      }
    });

    it("handles zero sequence number", () => {
      const checkpoint1: Checkpoint = { ...freshCheckpoint, sequence: 0 };
      const checkpoint2: Checkpoint = { ...freshCheckpoint, sequence: 1 };
      const result = compareCheckpoints(checkpoint1, checkpoint2);
      expect(isStale(result)).toBe(true);
    });

    it("treats empty string as unsupported algorithm", () => {
      const checkpoint: Checkpoint = { ...freshCheckpoint, algorithm: "" };
      const result = compareCheckpoints(checkpoint, freshCheckpoint);
      expect(isComparisonFailed(result)).toBe(true);
    });
  });
});
