/**
 * API client for fetching current contract state checkpoint (#293).
 *
 * Provides utilities to fetch the live revocation checkpoint from the contract
 * state endpoint, used for freshness comparison against proof checkpoints.
 *
 * The live checkpoint represents the current point-in-time state of the
 * revocation Merkle tree, used to determine whether a proof's checkpoint is
 * still current or has become stale as the contract advanced.
 */

import { apiClient, bearer, retryRead } from "./client";
import type { Checkpoint } from "@/lib/credentials/checkpoint-verification";

/**
 * Response shape from the contract state endpoint.
 * Maps to the Checkpoint type defined in checkpoint-verification.
 */
export interface CurrentCheckpointResponse {
  sequence: number;
  root: string;
  algorithm: string;
  ledger: string;
  observedAt: string;
}

/**
 * Fetch the current live contract state checkpoint.
 *
 * This endpoint retrieves the latest revocation checkpoint from the contract,
 * which is then compared against the checkpoint embedded in a proof to
 * determine if the revocation data is fresh or stale.
 *
 * Authorization:
 * - If token is provided, it's sent as a Bearer token
 * - If unauthorized (401/403), the error is propagated to the caller
 *   for handling as COMPARISON_FAILED with proper user messaging
 *
 * @param signal AbortSignal for request cancellation
 * @param token Optional Bearer token for authorization
 * @returns Current checkpoint data, or null if fetch fails
 * @throws Error if fetch fails (network error, 401, 5xx, etc.)
 */
export async function getCurrentCheckpoint(
  signal: AbortSignal,
  token?: string | null,
): Promise<Checkpoint> {
  return retryRead(async (signal) => {
    const response = await apiClient<CurrentCheckpointResponse>({
      path: "/contracts/current-checkpoint",
      method: "GET",
      headers: token ? bearer(token) : undefined,
      signal,
    });

    // Map API response to Checkpoint type
    return {
      sequence: response.sequence,
      root: response.root,
      algorithm: response.algorithm,
      ledger: response.ledger,
      observedAt: response.observedAt,
    };
  }, signal);
}

/**
 * Type guard for successful checkpoint fetch.
 */
export function isValidCheckpoint(value: unknown): value is Checkpoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.sequence === "number" &&
    typeof obj.root === "string" &&
    typeof obj.algorithm === "string" &&
    typeof obj.ledger === "string" &&
    typeof obj.observedAt === "string"
  );
}
