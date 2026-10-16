/**
 * Tests for contract state digest comparison logic.
 *
 * Covers positive cases (matching/mismatching digests), negative cases
 * (version errors, contract/network mismatches), and boundary conditions
 * (staleness thresholds, exact boundary timestamps).
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  calculateFreshness,
  performComparisonV1,
  createUnsupportedVersionError,
  createContractMismatchError,
  createNetworkMismatchError,
} from "@/lib/reconciliation/comparison";
import {
  MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
  MOCK_CONTRACT_STATE_DIGEST_V1_MISMATCHED,
  MOCK_BACKEND_PROJECTION_MATCHING,
  MOCK_BACKEND_PROJECTION_MISMATCHED,
  MOCK_BACKEND_PROJECTION_STALE,
  MOCK_CONTRACT_ADDRESS,
  MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
  MOCK_DIGEST_1,
  MOCK_DIGEST_2,
} from "@/tests/fixtures/reconciliation-fixtures";

const FIXTURE_REFERENCE_TIME = "2026-10-16T14:30:00Z";

describe("reconciliation/comparison", () => {
  describe("calculateFreshness", () => {
    it("calculates age correctly for fresh data", () => {
      const backendTime = "2026-10-16T14:29:50Z"; // 10 seconds old
      const liveTime = "2026-10-16T14:29:55Z"; // 5 seconds old
      const now = FIXTURE_REFERENCE_TIME;

      const freshness = calculateFreshness(backendTime, liveTime, now);

      expect(freshness.backendProjectionAge).toBe(10000);
      expect(freshness.liveDigestAge).toBe(5000);
      expect(freshness.isBackendStale).toBe(false);
      expect(freshness.isLiveDigestStale).toBe(false);
    });

    it("marks backend as stale if > 60 seconds old", () => {
      const backendTime = "2026-10-16T14:28:50Z"; // 70 seconds old
      const liveTime = FIXTURE_REFERENCE_TIME; // 0 seconds old
      const now = FIXTURE_REFERENCE_TIME;

      const freshness = calculateFreshness(backendTime, liveTime, now);

      expect(freshness.backendProjectionAge).toBe(70000);
      expect(freshness.isBackendStale).toBe(true);
      expect(freshness.isLiveDigestStale).toBe(false);
    });

    it("marks live digest as stale if > 30 seconds old", () => {
      const backendTime = FIXTURE_REFERENCE_TIME; // 0 seconds old
      const liveTime = "2026-10-16T14:29:20Z"; // 40 seconds old
      const now = FIXTURE_REFERENCE_TIME;

      const freshness = calculateFreshness(backendTime, liveTime, now);

      expect(freshness.liveDigestAge).toBe(40000);
      expect(freshness.isBackendStale).toBe(false);
      expect(freshness.isLiveDigestStale).toBe(true);
    });

    it("does not mark data as stale when exactly at threshold", () => {
      const backendTime = "2026-10-16T14:29:00Z"; // exactly 60 seconds old
      const liveTime = "2026-10-16T14:29:30Z"; // exactly 30 seconds old
      const now = FIXTURE_REFERENCE_TIME;

      const freshness = calculateFreshness(backendTime, liveTime, now);

      expect(freshness.backendProjectionAge).toBe(60000);
      expect(freshness.isBackendStale).toBe(false); // NOT stale
      expect(freshness.liveDigestAge).toBe(30000);
      expect(freshness.isLiveDigestStale).toBe(false); // NOT stale
    });

    it("marks data as stale 1ms over threshold", () => {
      const backendTime = "2026-10-16T14:28:59.999Z"; // 60.001 seconds old
      const liveTime = "2026-10-16T14:29:29.999Z"; // 30.001 seconds old
      const now = FIXTURE_REFERENCE_TIME;

      const freshness = calculateFreshness(backendTime, liveTime, now);

      expect(freshness.backendProjectionAge).toBeGreaterThan(60000);
      expect(freshness.isBackendStale).toBe(true);
      expect(freshness.liveDigestAge).toBeGreaterThan(30000);
      expect(freshness.isLiveDigestStale).toBe(true);
    });
  });

  describe("performComparisonV1", () => {
    describe("positive cases", () => {
      it("reports all-match when all components match", () => {
        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("all-match");
        expect(result.mismatches).toHaveLength(0);
        expect(result.componentComparisons).toHaveLength(4);
        expect(
          result.componentComparisons.every((c) => c.status === "match"),
        ).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("correctly identifies single component mismatch", () => {
        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          MOCK_CONTRACT_STATE_DIGEST_V1_MISMATCHED,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("some-mismatch");
        expect(result.mismatches).toHaveLength(1);
        expect(result.mismatches[0].component).toBe("issuerRegistryState");
        expect(result.mismatches[0].backendDigest).toBe(MOCK_DIGEST_1);
        expect(result.mismatches[0].liveDigest).toBe(MOCK_DIGEST_2);
      });

      it("includes all matching components in result even when some mismatch", () => {
        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          MOCK_CONTRACT_STATE_DIGEST_V1_MISMATCHED,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.componentComparisons).toHaveLength(4);
        const matchingComponents = result.componentComparisons.filter(
          (c) => c.status === "match",
        );
        expect(matchingComponents).toHaveLength(3);
      });

      it("tracks freshness even for matching digests", () => {
        const now = FIXTURE_REFERENCE_TIME;
        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_STALE,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          now,
        );

        expect(result.freshness.isBackendStale).toBe(true);
        expect(result.freshness.backendProjectionAge).toBeGreaterThan(60000);
      });

      it("normalizes digest values to lowercase for comparison", () => {
        const upperCaseDigest = {
          ...MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          components: {
            ...MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING.components,
            issuerRegistryState:
              MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING.components
                .issuerRegistryState.toUpperCase(),
          },
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          upperCaseDigest,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("all-match");
        expect(
          result.componentComparisons.every((c) => c.status === "match"),
        ).toBe(true);
      });

      it("generates unique request ID for each comparison", () => {
        const result1 = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        const result2 = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result1.requestId).not.toBe(result2.requestId);
        expect(result1.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      });
    });

    describe("negative cases - version errors", () => {
      it("fails closed with unsupported version error", () => {
        const unsupportedDigest = {
          ...MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          version: "v2" as any,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          unsupportedDigest,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("error");
        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe("UNSUPPORTED_DIGEST_VERSION");
        expect(result.error?.message).toContain("v2");
        expect(result.componentComparisons).toHaveLength(0);
      });
    });

    describe("negative cases - contract/network mismatch", () => {
      it("fails closed with contract mismatch error", () => {
        const mismatchedProjection = {
          ...MOCK_BACKEND_PROJECTION_MATCHING,
          contractAddress: MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          mismatchedProjection,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("error");
        expect(result.error?.code).toBe("CONTRACT_IDENTITY_MISMATCH");
        expect(result.error?.message).toContain(MOCK_CONTRACT_ADDRESS);
        expect(result.error?.message).toContain(MOCK_ALTERNATIVE_CONTRACT_ADDRESS);
      });

      it("fails closed with network mismatch error", () => {
        const mismatchedProjection = {
          ...MOCK_BACKEND_PROJECTION_MATCHING,
          network: "public" as const,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          mismatchedProjection,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.overallStatus).toBe("error");
        expect(result.error?.code).toBe("NETWORK_MISMATCH");
        expect(result.error?.message).toContain("testnet");
        expect(result.error?.message).toContain("public");
      });

      it("performs comparison even when both sides are stale", () => {
        const now = FIXTURE_REFERENCE_TIME;
        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_STALE,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          now,
        );

        // Comparison should proceed; staleness is informational, not blocking
        expect(result.overallStatus).toBe("all-match");
        expect(result.freshness.isBackendStale).toBe(true);
        expect(result.freshness.isLiveDigestStale).toBe(false); // in fixture, fetched at now
      });
    });

    describe("error catalog functions", () => {
      it("createUnsupportedVersionError returns correct error shape", () => {
        const error = createUnsupportedVersionError("v2");

        expect(error.code).toBe("UNSUPPORTED_DIGEST_VERSION");
        expect(error.message).toContain("v2");
        expect(error.details?.receivedVersion).toBe("v2");
        expect(error.details?.supportedVersions).toEqual(["v1"]);
      });

      it("createContractMismatchError returns correct error shape", () => {
        const error = createContractMismatchError(
          MOCK_CONTRACT_ADDRESS,
          MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
        );

        expect(error.code).toBe("CONTRACT_IDENTITY_MISMATCH");
        expect(error.message).toContain(MOCK_CONTRACT_ADDRESS);
        expect(error.details?.selectedContract).toBe(MOCK_CONTRACT_ADDRESS);
        expect(error.details?.backendContract).toBe(
          MOCK_ALTERNATIVE_CONTRACT_ADDRESS,
        );
      });

      it("createNetworkMismatchError returns correct error shape", () => {
        const error = createNetworkMismatchError("testnet", "public");

        expect(error.code).toBe("NETWORK_MISMATCH");
        expect(error.message).toContain("testnet");
        expect(error.details?.selectedNetwork).toBe("testnet");
        expect(error.details?.backendNetwork).toBe("public");
      });
    });

    describe("boundary conditions", () => {
      it("handles data exactly at 60-second backend staleness boundary", () => {
        const backendTime = "2026-10-16T14:29:00Z"; // exactly 60 seconds
        const projection = {
          ...MOCK_BACKEND_PROJECTION_MATCHING,
          projectionAsOf: backendTime,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          projection,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.freshness.isBackendStale).toBe(false); // NOT stale at boundary
        expect(result.overallStatus).toBe("all-match");
      });

      it("handles data just over 60-second backend staleness boundary", () => {
        const backendTime = "2026-10-16T14:28:59.999Z"; // 60.001 seconds
        const projection = {
          ...MOCK_BACKEND_PROJECTION_MATCHING,
          projectionAsOf: backendTime,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          projection,
          MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.freshness.isBackendStale).toBe(true);
      });

      it("handles data exactly at 30-second live digest staleness boundary", () => {
        const liveTime = "2026-10-16T14:29:30Z"; // exactly 30 seconds
        const liveDigest = {
          ...MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          asOfTimestamp: liveTime,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          liveDigest,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.freshness.isLiveDigestStale).toBe(false); // NOT stale at boundary
      });

      it("handles data just over 30-second live digest staleness boundary", () => {
        const liveTime = "2026-10-16T14:29:29.999Z"; // 30.001 seconds
        const liveDigest = {
          ...MOCK_CONTRACT_STATE_DIGEST_V1_MATCHING,
          asOfTimestamp: liveTime,
        };

        const result = performComparisonV1(
          "testnet",
          MOCK_CONTRACT_ADDRESS,
          MOCK_BACKEND_PROJECTION_MATCHING,
          liveDigest,
          FIXTURE_REFERENCE_TIME,
        );

        expect(result.freshness.isLiveDigestStale).toBe(true);
      });
    });
  });
});
