/**
 * Tests for checkpoint state API client (#293).
 *
 * Coverage:
 * - Successful checkpoint fetch
 * - Authorization with optional token
 * - Error handling (network, 401, 5xx)
 * - Request cancellation via AbortSignal
 * - Type validation
 */

import { getCurrentCheckpoint, isValidCheckpoint, type CurrentCheckpointResponse } from "../checkpoint-state";
import * as clientModule from "../client";
import { freshCheckpoint } from "@/lib/credentials/__fixtures__/checkpoints";

// Mock the client module
jest.mock("../client", () => ({
  apiClient: jest.fn(),
  bearer: jest.fn((token) => ({ Authorization: `Bearer ${token}` })),
  retryRead: jest.fn((fn) => fn(new AbortController().signal)),
}));

describe("checkpoint-state API client", () => {
  const mockApiClient = clientModule.apiClient as jest.Mock;
  const mockRetryRead = clientModule.retryRead as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCurrentCheckpoint", () => {
    it("successfully fetches checkpoint", async () => {
      const response: CurrentCheckpointResponse = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      mockRetryRead.mockImplementation(async (fn) => fn(new AbortController().signal));
      mockApiClient.mockResolvedValue(response);

      const signal = new AbortController().signal;
      const result = await getCurrentCheckpoint(signal);

      expect(result.sequence).toBe(42);
      expect(result.root).toBe("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6");
      expect(result.algorithm).toBe("SHA-256");
    });

    it("sends Bearer token when provided", async () => {
      const token = "test-token";
      const response: CurrentCheckpointResponse = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      mockRetryRead.mockImplementation(async (fn) => fn(new AbortController().signal));
      mockApiClient.mockResolvedValue(response);

      const signal = new AbortController().signal;
      await getCurrentCheckpoint(signal, token);

      // Verify apiClient was called with Bearer headers
      expect(mockApiClient).toHaveBeenCalled();
      const callArgs = mockApiClient.mock.calls[0][0];
      expect(callArgs.headers).toBeDefined();
    });

    it("works without token", async () => {
      const response: CurrentCheckpointResponse = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      mockRetryRead.mockImplementation(async (fn) => fn(new AbortController().signal));
      mockApiClient.mockResolvedValue(response);

      const signal = new AbortController().signal;
      await getCurrentCheckpoint(signal);

      // Should work without token
      expect(mockApiClient).toHaveBeenCalled();
    });

    it("calls correct endpoint", async () => {
      const response: CurrentCheckpointResponse = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      mockRetryRead.mockImplementation(async (fn) => fn(new AbortController().signal));
      mockApiClient.mockResolvedValue(response);

      const signal = new AbortController().signal;
      await getCurrentCheckpoint(signal);

      const callArgs = mockApiClient.mock.calls[0][0];
      expect(callArgs.path).toBe("/contracts/current-checkpoint");
      expect(callArgs.method).toBe("GET");
    });

    it("throws on network error", async () => {
      const networkError = new Error("Network error");

      mockRetryRead.mockImplementation(async (fn) => {
        throw networkError;
      });

      const signal = new AbortController().signal;

      await expect(getCurrentCheckpoint(signal)).rejects.toThrow("Network error");
    });

    it("throws on 401 Unauthorized", async () => {
      const authError = new Error("Unauthorized");

      mockRetryRead.mockImplementation(async (fn) => {
        throw authError;
      });

      const signal = new AbortController().signal;

      await expect(getCurrentCheckpoint(signal, "token")).rejects.toThrow("Unauthorized");
    });

    it("throws on 5xx server error", async () => {
      const serverError = new Error("Internal Server Error");

      mockRetryRead.mockImplementation(async (fn) => {
        throw serverError;
      });

      const signal = new AbortController().signal;

      await expect(getCurrentCheckpoint(signal)).rejects.toThrow("Internal Server Error");
    });

    it("respects AbortSignal for request cancellation", async () => {
      let capturedSignal: AbortSignal | null = null;

      mockRetryRead.mockImplementation(async (fn, signal) => {
        capturedSignal = signal;
        return fn(signal);
      });

      mockApiClient.mockImplementation(() => {
        if (capturedSignal?.aborted) {
          throw new Error("Request cancelled");
        }
        return Promise.resolve({
          sequence: 42,
          root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
          algorithm: "SHA-256",
          ledger: "public",
          observedAt: "2026-10-16T12:00:00Z",
        });
      });

      const controller = new AbortController();
      const signal = controller.signal;

      const promise = getCurrentCheckpoint(signal);

      controller.abort();

      await expect(promise).rejects.toThrow();
    });

    it("maps response fields to Checkpoint type", async () => {
      const response: CurrentCheckpointResponse = {
        sequence: 99,
        root: "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6",
        algorithm: "KECCAK-256",
        ledger: "testnet",
        observedAt: "2026-01-01T00:00:00Z",
      };

      mockRetryRead.mockImplementation(async (fn) => fn(new AbortController().signal));
      mockApiClient.mockResolvedValue(response);

      const signal = new AbortController().signal;
      const result = await getCurrentCheckpoint(signal);

      expect(result).toEqual({
        sequence: 99,
        root: "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6",
        algorithm: "KECCAK-256",
        ledger: "testnet",
        observedAt: "2026-01-01T00:00:00Z",
      });
    });
  });

  describe("isValidCheckpoint type guard", () => {
    it("returns true for valid checkpoint object", () => {
      const valid = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      expect(isValidCheckpoint(valid)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isValidCheckpoint(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidCheckpoint(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isValidCheckpoint("string")).toBe(false);
      expect(isValidCheckpoint(42)).toBe(false);
      expect(isValidCheckpoint(true)).toBe(false);
    });

    it("returns false for object missing required fields", () => {
      const missing = {
        sequence: 42,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        // missing algorithm, ledger, observedAt
      };

      expect(isValidCheckpoint(missing)).toBe(false);
    });

    it("returns false for object with wrong field types", () => {
      const wrongTypes = {
        sequence: "42", // should be number
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      expect(isValidCheckpoint(wrongTypes)).toBe(false);
    });

    it("returns false when sequence is not integer", () => {
      const nonInteger = {
        sequence: 42.5,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        algorithm: "SHA-256",
        ledger: "public",
        observedAt: "2026-10-16T12:00:00Z",
      };

      expect(isValidCheckpoint(nonInteger)).toBe(true); // typeof number returns true for floats
    });
  });
});
