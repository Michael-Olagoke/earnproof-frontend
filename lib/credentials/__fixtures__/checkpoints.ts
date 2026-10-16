/**
 * Synthetic test fixtures for checkpoint verification (#293).
 *
 * All fixtures use synthetic, non-sensitive data. No real checkpoint hashes,
 * wallet material, proof data, or production credentials are included.
 */

import type { Checkpoint } from "../checkpoint-verification";

/**
 * A fresh checkpoint — represents current live contract state.
 * Sequence and root match what a new verification would see now.
 */
export const freshCheckpoint: Checkpoint = {
  sequence: 42,
  root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-10-16T12:00:00Z",
};

/**
 * A stale checkpoint exactly 1 sequence behind current state.
 * Used to test boundary condition: sequence exactly 1 behind → STALE.
 */
export const staleBoundaryCheckpoint: Checkpoint = {
  sequence: 41,
  root: "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-10-16T11:55:00Z",
};

/**
 * A stale checkpoint multiple sequences behind.
 * Used to test that all stale gaps (1+) are treated uniformly as STALE.
 */
export const staleMultipleCheckpoint: Checkpoint = {
  sequence: 35,
  root: "p1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k2l3m4n5",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-10-16T11:30:00Z",
};

/**
 * A checkpoint with unsupported algorithm.
 * Used to test COMPARISON_FAILED state: unsupported-algorithm reason.
 */
export const unsupportedAlgorithmCheckpoint: Checkpoint = {
  sequence: 42,
  root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5",
  algorithm: "BLAKE3",
  ledger: "public",
  observedAt: "2026-10-16T12:00:00Z",
};

/**
 * A checkpoint with KECCAK-256 (supported algorithm, different from SHA-256).
 * Used to test multi-algorithm support.
 */
export const keccakCheckpoint: Checkpoint = {
  sequence: 42,
  root: "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  algorithm: "KECCAK-256",
  ledger: "public",
  observedAt: "2026-10-16T12:00:00Z",
};

/**
 * A checkpoint with different ledger identifier.
 * Used to test that ledger mismatch is handled (compared in freshness, not blocking).
 */
export const differentLedgerCheckpoint: Checkpoint = {
  sequence: 42,
  root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5",
  algorithm: "SHA-256",
  ledger: "testnet",
  observedAt: "2026-10-16T12:00:00Z",
};

/**
 * A checkpoint at sequence 0 (minimum valid).
 * Used to test boundary: zero sequence is valid.
 */
export const zeroSequenceCheckpoint: Checkpoint = {
  sequence: 0,
  root: "c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-10-16T00:00:00Z",
};

/**
 * A checkpoint with very large sequence number.
 * Used to test that large integers are handled correctly.
 */
export const largeSequenceCheckpoint: Checkpoint = {
  sequence: 1000000,
  root: "d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-10-16T12:00:00Z",
};

/**
 * A checkpoint with older observed time.
 * Used to test timestamp handling and display formatting.
 */
export const oldCheckpoint: Checkpoint = {
  sequence: 10,
  root: "e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9",
  algorithm: "SHA-256",
  ledger: "public",
  observedAt: "2026-01-01T00:00:00Z",
};

/**
 * Group of fixtures for testing FRESH state transitions.
 */
export const freshScenario = {
  proof: freshCheckpoint,
  live: freshCheckpoint,
};

/**
 * Group of fixtures for testing STALE state transitions (boundary: 1 behind).
 */
export const staleBoundaryScenario = {
  proof: staleBoundaryCheckpoint,
  live: freshCheckpoint,
};

/**
 * Group of fixtures for testing STALE state transitions (5 sequences behind).
 */
export const staleMultipleScenario = {
  proof: staleMultipleCheckpoint,
  live: freshCheckpoint,
};

/**
 * Group of fixtures for testing COMPARISON_FAILED with unsupported algorithm.
 */
export const unsupportedAlgorithmScenario = {
  proof: unsupportedAlgorithmCheckpoint,
  live: freshCheckpoint,
};

/**
 * Group of fixtures for testing multi-algorithm scenarios.
 */
export const multiAlgorithmScenario = {
  proof: freshCheckpoint, // SHA-256
  live: keccakCheckpoint, // KECCAK-256
};

/**
 * Group of fixtures for testing edge case: checkpoint not present (null proof checkpoint).
 */
export const missingProofCheckpointScenario = {
  proof: null as Checkpoint | null,
  live: freshCheckpoint,
};

/**
 * Group of fixtures for testing edge case: live checkpoint fetch failed (null live checkpoint).
 */
export const failedFetchScenario = {
  proof: freshCheckpoint,
  live: null as Checkpoint | null,
};

/**
 * Comprehensive fixture set for component testing.
 * Includes all major scenarios and boundary conditions.
 */
export const allScenarios = {
  fresh: freshScenario,
  staleBoundary: staleBoundaryScenario,
  staleMultiple: staleMultipleScenario,
  unsupportedAlgorithm: unsupportedAlgorithmScenario,
  multiAlgorithm: multiAlgorithmScenario,
  missingProofCheckpoint: missingProofCheckpointScenario,
  failedFetch: failedFetchScenario,
} as const;

/**
 * Utility to generate a checkpoint with custom overrides.
 * Useful for generating additional fixture variations.
 */
export function createCheckpoint(overrides: Partial<Checkpoint>): Checkpoint {
  return {
    ...freshCheckpoint,
    ...overrides,
  };
}
