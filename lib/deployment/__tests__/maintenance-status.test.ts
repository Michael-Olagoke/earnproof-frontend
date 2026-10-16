/**
 * Tests for maintenance/drain status contract parsing, validation, and helpers.
 *
 * Coverage:
 * - Positive: valid documents in each phase (normal, draining, drained, recovering)
 * - Estimated window: server-provided shows; no estimate shows unknown; never fabricated
 * - Failure modes: unavailable endpoint, malformed JSON, bad shape
 * - Stale-state: documents older than MAX_AGE_MS
 * - Boundary: exact phase transitions, empty/populated arrays
 */

import {
  fetchMaintenanceStatus,
  getEstimatedCompletion,
  getPhaseDescription,
  isCapabilityBlocked,
  shouldBlockWrites,
  MAINTENANCE_STATUS_MAX_AGE_MS,
} from "@/lib/deployment/maintenance-status";
import { apiClient } from "@/lib/api/client";

jest.mock("@/lib/api/client");

const mockedApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

describe("maintenance-status: parsing and validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============ POSITIVE: Valid documents in each phase ============

  describe("positive: valid documents", () => {
    it("parses valid normal phase document", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      if (result.status === "valid") {
        expect(result.data.phase).toBe("normal");
        expect(result.data.affectedCapabilities).toEqual([]);
      }
    });

    it("parses valid draining phase with affected capabilities", async () => {
      const now = new Date().toISOString();
      const estimatedCompletion = new Date(Date.now() + 60000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: ["proofs:create", "payments:sync"],
        estimatedCompletionAt: estimatedCompletion,
        queuedOperations: [
          { id: "op-1", type: "proof_creation", enqueuedAt: now },
        ],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      if (result.status === "valid") {
        expect(result.data.phase).toBe("draining");
        expect(result.data.affectedCapabilities).toContain("proofs:create");
        expect(result.data.estimatedCompletionAt).toBe(estimatedCompletion);
        expect(result.data.queuedOperations).toHaveLength(1);
      }
    });

    it("parses valid drained phase", async () => {
      const now = new Date().toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "drained",
        affectedCapabilities: ["proofs:create", "payments:sync"],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      if (result.status === "valid") {
        expect(result.data.phase).toBe("drained");
      }
    });

    it("parses valid recovering phase with recovery progress", async () => {
      const now = new Date().toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "recovering",
        affectedCapabilities: ["proofs:create"],
        recoveryProgress: { current: 5, total: 10 },
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      if (result.status === "valid") {
        expect(result.data.phase).toBe("recovering");
        expect(result.data.recoveryProgress?.current).toBe(5);
        expect(result.data.recoveryProgress?.total).toBe(10);
      }
    });
  });

  // ============ ESTIMATED WINDOW: Server evidence only ============

  describe("estimated window: server evidence only", () => {
    it("returns null for missing estimatedCompletionAt", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      const completion = getEstimatedCompletion(result);
      expect(completion).toBeNull();
    });

    it("returns null for null estimatedCompletionAt", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        estimatedCompletionAt: null,
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      const completion = getEstimatedCompletion(result);
      expect(completion).toBeNull();
    });

    it("returns server-provided estimate when present", async () => {
      const now = new Date().toISOString();
      const estimate = new Date(Date.now() + 120000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        estimatedCompletionAt: estimate,
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      const completion = getEstimatedCompletion(result);
      expect(completion).toBe(estimate);
    });

    it("never returns a fabricated/client-computed estimate", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: ["proofs:create"],
        timestamp: now,
        // No estimatedCompletionAt provided
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      const completion = getEstimatedCompletion(result);

      // Must be null, not a default like "30 seconds from now"
      expect(completion).toBeNull();
    });
  });

  // ============ FAILURE MODES ============

  describe("failure modes", () => {
    it("returns unavailable on network error", async () => {
      mockedApiClient.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("unavailable");
      expect((result as any).reason).toContain("Network");
    });

    it("returns malformed on non-object response", async () => {
      mockedApiClient.mockResolvedValueOnce("not an object");

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });

    it("returns malformed on missing required phase field", async () => {
      mockedApiClient.mockResolvedValueOnce({
        affectedCapabilities: [],
        timestamp: new Date().toISOString(),
        // Missing phase
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });

    it("returns malformed on invalid phase value", async () => {
      mockedApiClient.mockResolvedValueOnce({
        phase: "invalid-phase",
        affectedCapabilities: [],
        timestamp: new Date().toISOString(),
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });

    it("returns malformed on non-array affectedCapabilities", async () => {
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: "not-an-array",
        timestamp: new Date().toISOString(),
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });

    it("returns malformed on invalid timestamp", async () => {
      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: "not-a-date",
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });

    it("returns malformed on recoveryProgress in non-recovering phase", async () => {
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        recoveryProgress: { current: 5, total: 10 },
        timestamp: new Date().toISOString(),
      });

      const result = await fetchMaintenanceStatus();

      // Recovery progress should only be present in recovering phase
      expect(result.status).toBe("malformed");
    });
  });

  // ============ STALE STATE ============

  describe("stale state", () => {
    it("returns stale for old document", async () => {
      const oldTime = new Date(Date.now() - MAINTENANCE_STATUS_MAX_AGE_MS - 1000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: oldTime,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("stale");
      if (result.status === "stale") {
        expect(result.ageMs).toBeGreaterThan(MAINTENANCE_STATUS_MAX_AGE_MS);
      }
    });

    it("returns valid for fresh document (just under TTL)", async () => {
      const recentTime = new Date(Date.now() - MAINTENANCE_STATUS_MAX_AGE_MS + 1000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: recentTime,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
    });
  });

  // ============ HELPERS: isCapabilityBlocked, shouldBlockWrites ============

  describe("helper: isCapabilityBlocked", () => {
    it("returns true when capability is in affectedCapabilities", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: ["proofs:create", "payments:sync"],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(isCapabilityBlocked(result, "proofs:create")).toBe(true);
      expect(isCapabilityBlocked(result, "payments:sync")).toBe(true);
    });

    it("returns false when capability is not affected", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: ["proofs:create"],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(isCapabilityBlocked(result, "payments:sync")).toBe(false);
    });

    it("returns true for unavailable status (fail-safe)", async () => {
      mockedApiClient.mockRejectedValueOnce(new Error("Network error"));

      const result = await fetchMaintenanceStatus();

      expect(isCapabilityBlocked(result, "proofs:create")).toBe(true);
    });

    it("returns true for stale status (fail-safe)", async () => {
      const oldTime = new Date(Date.now() - MAINTENANCE_STATUS_MAX_AGE_MS - 1000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: oldTime,
      });

      const result = await fetchMaintenanceStatus();

      // Even though phase is normal, stale data → fail-safe
      expect(isCapabilityBlocked(result, "proofs:create")).toBe(true);
    });
  });

  describe("helper: shouldBlockWrites", () => {
    it("returns false for valid normal phase", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(false);
    });

    it("returns true for valid draining phase", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });

    it("returns true for valid drained phase", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "drained",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });

    it("returns true for valid recovering phase", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "recovering",
        affectedCapabilities: [],
        recoveryProgress: { current: 0, total: 10 },
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });

    it("returns true for unavailable (fail-safe)", async () => {
      mockedApiClient.mockRejectedValueOnce(new Error("Network error"));

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });

    it("returns true for malformed (fail-safe)", async () => {
      mockedApiClient.mockResolvedValueOnce({ invalid: true });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });

    it("returns true for stale, regardless of phase (fail-safe)", async () => {
      const oldTime = new Date(Date.now() - MAINTENANCE_STATUS_MAX_AGE_MS - 1000).toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: oldTime,
      });

      const result = await fetchMaintenanceStatus();

      expect(shouldBlockWrites(result)).toBe(true);
    });
  });

  // ============ PHASE DESCRIPTIONS ============

  describe("helper: getPhaseDescription", () => {
    it("returns appropriate description for each phase", () => {
      expect(getPhaseDescription("normal")).toContain("operational");
      expect(getPhaseDescription("draining")).toContain("paused");
      expect(getPhaseDescription("drained")).toContain("locked");
      expect(getPhaseDescription("recovering")).toContain("Restoring");
    });
  });

  // ============ BOUNDARY CONDITIONS ============

  describe("boundary conditions", () => {
    it("handles empty affectedCapabilities array", async () => {
      const now = new Date().toISOString();
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: [],
        timestamp: now,
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("valid");
      if (result.status === "valid") {
        expect(result.data.affectedCapabilities).toHaveLength(0);
        expect(isCapabilityBlocked(result, "any:capability")).toBe(false);
      }
    });

    it("handles exact phase transition boundary", async () => {
      // Test that the exact timestamp boundary works correctly
      const exactBoundary = new Date(Date.now() - MAINTENANCE_STATUS_MAX_AGE_MS);
      const atBoundary = exactBoundary.toISOString();

      mockedApiClient.mockResolvedValueOnce({
        phase: "normal",
        affectedCapabilities: [],
        timestamp: atBoundary,
      });

      const result = await fetchMaintenanceStatus();

      // Should still be valid (at boundary, not past it)
      expect(result.status).toBe("valid");
    });

    it("rejects recovery progress with invalid values", async () => {
      mockedApiClient.mockResolvedValueOnce({
        phase: "recovering",
        affectedCapabilities: [],
        recoveryProgress: { current: -1, total: 10 },
        timestamp: new Date().toISOString(),
      });

      const result = await fetchMaintenanceStatus();

      expect(result.status).toBe("malformed");
    });
  });

  // ============ REPLAY / CONCURRENCY ============

  describe("replay and concurrent requests", () => {
    it("handles duplicate/replayed status poll (returns same structure)", async () => {
      const now = new Date().toISOString();
      const document = {
        phase: "draining",
        affectedCapabilities: ["proofs:create"],
        timestamp: now,
      };

      mockedApiClient.mockResolvedValueOnce(document);
      const result1 = await fetchMaintenanceStatus();

      mockedApiClient.mockResolvedValueOnce(document);
      const result2 = await fetchMaintenanceStatus();

      // Both should be valid and identical
      expect(result1.status).toBe("valid");
      expect(result2.status).toBe("valid");

      if (result1.status === "valid" && result2.status === "valid") {
        expect(result1.data.phase).toBe(result2.data.phase);
        expect(result1.data.affectedCapabilities).toEqual(result2.data.affectedCapabilities);
      }
    });

    it("handles different status values from successive polls", async () => {
      // First poll: draining
      mockedApiClient.mockResolvedValueOnce({
        phase: "draining",
        affectedCapabilities: ["proofs:create"],
        timestamp: new Date().toISOString(),
      });
      const result1 = await fetchMaintenanceStatus();

      // Second poll: drained
      mockedApiClient.mockResolvedValueOnce({
        phase: "drained",
        affectedCapabilities: ["proofs:create"],
        timestamp: new Date().toISOString(),
      });
      const result2 = await fetchMaintenanceStatus();

      expect(result1.status).toBe("valid");
      expect(result2.status).toBe("valid");

      if (result1.status === "valid" && result2.status === "valid") {
        expect(result1.data.phase).toBe("draining");
        expect(result2.data.phase).toBe("drained");
      }
    });
  });
});
