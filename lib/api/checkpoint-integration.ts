/**
 * Integration utilities for checkpoint inspection and freshness UI (#293).
 *
 * Provides hooks and utilities to integrate checkpoint display and freshness
 * comparison into verification result pages and components.
 */

import { getCurrentCheckpoint } from "./checkpoint-state";
import type { Checkpoint } from "@/lib/credentials/checkpoint-verification";

/**
 * Creates a checkpoint fetch function suitable for CheckpointFreshnessPanel.
 *
 * @param token Optional authorization token
 * @returns Async function that fetches current checkpoint with AbortSignal support
 */
export function createCheckpointFetcher(token?: string | null) {
  return async (signal: AbortSignal): Promise<Checkpoint | null> => {
    try {
      return await getCurrentCheckpoint(signal, token);
    } catch (error) {
      // Return null on any error; component will render COMPARISON_FAILED state
      return null;
    }
  };
}

/**
 * Checks if a verification result includes checkpoint data.
 * Useful for conditional rendering of checkpoint panels.
 */
export function hasCheckpoint(revocationCheckpoint: unknown): revocationCheckpoint is Checkpoint {
  return (
    revocationCheckpoint !== null &&
    revocationCheckpoint !== undefined &&
    typeof revocationCheckpoint === "object" &&
    "sequence" in revocationCheckpoint &&
    "root" in revocationCheckpoint
  );
}
