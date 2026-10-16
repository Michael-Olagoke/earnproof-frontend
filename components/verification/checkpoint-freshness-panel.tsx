"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { truncateHash } from "@/lib/credentials/checkpoint-verification";
import { compareCheckpoints, formatComparisonFailureReason, type CheckpointFreshnessResult } from "@/lib/credentials/checkpoint-verification";
import type { Checkpoint } from "@/lib/credentials/checkpoint-verification";

export type CheckpointFreshnessPanelProps = {
  proofCheckpoint: Checkpoint | null | undefined;
  /**
   * Async function to fetch current live contract state checkpoint.
   * Called on component mount and on manual refresh.
   */
  onFetchLiveCheckpoint: (signal: AbortSignal) => Promise<Checkpoint | null>;
  /**
   * Optional token for authorization when fetching live state.
   */
  token?: string | null;
};

/**
 * CheckpointFreshnessPanel compares a proof's checkpoint against the current
 * live contract state checkpoint to determine freshness.
 *
 * Renders three distinct freshness states:
 * - FRESH: Checkpoint sequence/root match current state (emerald/green)
 * - STALE: Checkpoint is behind current state (rose/red, prominent marking)
 * - COMPARISON_FAILED: Fetch error, unsupported algorithm, or authorization denied (amber/yellow)
 *
 * Includes a refresh action to re-fetch live state and re-compare on demand.
 * Refresh is debounced and disabled during in-flight fetch to prevent overlapping requests.
 *
 * CRITICAL: This panel is purely informational. Checkpoint freshness never
 * overrides or affects the underlying proof validity result.
 */
export function CheckpointFreshnessPanel({
  proofCheckpoint,
  onFetchLiveCheckpoint,
  token,
}: CheckpointFreshnessPanelProps) {
  const [freshness, setFreshness] = useState<CheckpointFreshnessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  /**
   * Fetch live contract state and compare against proof checkpoint.
   * Uses AbortController to cancel previous in-flight requests on new refresh.
   */
  const fetchAndCompare = useCallback(async () => {
    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const liveCheckpoint = await onFetchLiveCheckpoint(abortControllerRef.current.signal);
      const result = compareCheckpoints(proofCheckpoint, liveCheckpoint);
      setFreshness(result);
    } catch (err) {
      // Ignore abort errors (user cancelled or new refresh triggered)
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to fetch checkpoint");
        setFreshness({
          state: "COMPARISON_FAILED",
          reason: "fetch-error",
          details: err instanceof Error ? err.message : undefined,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [proofCheckpoint, onFetchLiveCheckpoint]);

  /**
   * Initialize freshness check on mount.
   */
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      fetchAndCompare();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fetchAndCompare]);

  /**
   * Handle refresh action with debouncing (500ms) to prevent overlapping requests.
   */
  const handleRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchAndCompare();
    }, 500);
  }, [fetchAndCompare]);

  // Cannot compare if proof checkpoint is missing
  if (!proofCheckpoint) {
    return (
      <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
        <div className="flex items-start gap-3">
          <div className="text-amber-300 text-lg">?</div>
          <div>
            <h3 className="text-sm font-semibold text-amber-100 mb-1">Checkpoint Comparison Unavailable</h3>
            <p className="text-xs text-slate-300">Checkpoint data not available for this proof</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !freshness) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-300 border-t-transparent" />
          <span className="text-xs text-slate-400">Checking contract state...</span>
        </div>
      </div>
    );
  }

  // Render freshness states
  if (!freshness) {
    return null;
  }

  if (freshness.state === "FRESH") {
    return (
      <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-5">
        <div className="flex items-start gap-3">
          <div className="text-emerald-300 text-lg">✓</div>
          <div className="flex-1">
            <div className="inline-flex rounded-md border border-emerald-300/50 bg-emerald-300/20 px-2 py-1 text-xs font-semibold uppercase text-emerald-100 mb-3">
              Fresh
            </div>
            <p className="text-xs text-slate-300">
              Checkpoint matches current contract state. Revocation data is current.
            </p>
            <div className="mt-2 text-xs text-slate-400 space-y-1">
              <div>
                <span className="font-semibold">Sequence:</span>{" "}
                {freshness.proofCheckpoint.sequence}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-white/15 text-slate-300 hover:bg-white/5 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
              Checking...
            </>
          ) : (
            "Refresh"
          )}
        </button>
      </div>
    );
  }

  if (freshness.state === "STALE") {
    return (
      <div className="rounded-lg border-2 border-rose-300/50 bg-rose-300/15 p-5">
        <div className="flex items-start gap-3">
          <div className="text-rose-300 text-xl font-bold">⚠</div>
          <div className="flex-1">
            <div className="inline-flex rounded-md border border-rose-300/50 bg-rose-400/30 px-2 py-1 text-xs font-bold uppercase text-rose-100 mb-2">
              Stale
            </div>
            <p className="text-sm font-semibold text-rose-100 mb-2">
              Contract has advanced
            </p>
            <p className="text-xs text-slate-300 mb-3">
              The revocation checkpoint used by this proof is behind the current contract state.
              The contract has progressed {freshness.sequencesBehind} checkpoint{freshness.sequencesBehind !== 1 ? "s" : ""}.
            </p>
            <div className="mt-3 grid gap-2 text-xs text-slate-400 bg-white/5 rounded p-2">
              <div className="flex justify-between">
                <span>Proof checkpoint sequence:</span>
                <span className="font-semibold text-slate-100">{freshness.proofCheckpoint.sequence}</span>
              </div>
              <div className="flex justify-between">
                <span>Current sequence:</span>
                <span className="font-semibold text-slate-100">{freshness.liveCheckpoint.sequence}</span>
              </div>
              <div className="flex justify-between">
                <span>Behind by:</span>
                <span className="font-semibold text-rose-200">{freshness.sequencesBehind}</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-rose-300/50 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
              Checking...
            </>
          ) : (
            "Refresh"
          )}
        </button>
      </div>
    );
  }

  // COMPARISON_FAILED state
  return (
    <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
      <div className="flex items-start gap-3">
        <div className="text-amber-300 text-lg">!</div>
        <div className="flex-1">
          <div className="inline-flex rounded-md border border-amber-300/50 bg-amber-300/20 px-2 py-1 text-xs font-semibold uppercase text-amber-100 mb-2">
            Comparison Unavailable
          </div>
          <p className="text-xs text-slate-300">
            {formatComparisonFailureReason(freshness)}
            {freshness.details && ` — ${freshness.details}`}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Unable to determine checkpoint freshness. This does not affect proof validity.
          </p>
        </div>
      </div>
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-white/15 text-slate-300 hover:bg-white/5 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent" />
            Checking...
          </>
        ) : (
          "Retry"
        )}
      </button>
    </div>
  );
}
