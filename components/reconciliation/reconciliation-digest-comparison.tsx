"use client";

/**
 * Contract state digest comparison tool component.
 *
 * Main UI for operators to select a network and contract,
 * trigger a comparison against backend projection and live on-chain state,
 * view component-level results, track freshness, and export mismatches.
 *
 * Implements authorization checks, debouncing, request counter pattern,
 * and deterministic error handling per design spec.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import type {
  ReconciliationComponentState,
  ContractStateComparisonResult,
  SessionData,
  NetworkIdentifier,
} from "@/lib/reconciliation/types";
import { isRoleAuthorizedForReconciliation } from "@/lib/validation/reconciliation";
import {
  getBackendContractStateProjection,
  getLiveContractStateDigest,
  getAvailableContractsForReconciliation,
} from "@/lib/api/reconciliation";
import { performComparisonV1 } from "@/lib/reconciliation/comparison";
import { NetworkContractSelector } from "./network-contract-selector";
import { ComparisonResults } from "./comparison-results";
import { MismatchExportSection } from "./mismatch-export-section";

interface ReconciliationDigestComparisonProps {
  session: SessionData | null;
}

/**
 * Main reconciliation component.
 *
 * Orchestrates the full workflow:
 * 1. Authorization check (fail closed if not ADMIN/ISSUER)
 * 2. Network/contract selection
 * 3. Fetch backend projection and live digest (concurrent)
 * 4. Perform comparison
 * 5. Display results with freshness info
 * 6. Support export of mismatches
 */
export function ReconciliationDigestComparison(
  props: ReconciliationDigestComparisonProps,
): React.ReactElement {
  const { session } = props;

  // State management
  const [state, setState] = useState<ReconciliationComponentState>({
    selectedNetwork: null,
    selectedContractAddress: null,
    availableContracts: [],
    isLoading: false,
    error: null,
    result: null,
    lastComparisonKey: null,
    lastComparisonTime: null,
  });

  // Request counter for out-of-order response guard
  const requestCounterRef = useRef(0);
  const currentRequestRef = useRef(0);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cache for debouncing rapid comparisons (5 second TTL)
  const comparisonCacheRef = useRef<{
    key: string;
    result: ContractStateComparisonResult;
    timestamp: number;
  } | null>(null);

  /**
   * Authorization check: only ADMIN and ISSUER can proceed.
   */
  const isAuthorized = useCallback(() => {
    if (!session) {
      return false;
    }
    return isRoleAuthorizedForReconciliation(session.user.role);
  }, [session]);

  /**
   * Generate cache key for a comparison request.
   * Used for replay/debounce detection.
   */
  const generateCacheKey = useCallback(
    (network: NetworkIdentifier, contractAddress: string): string => {
      return `${network}:${contractAddress.toUpperCase()}`;
    },
    [],
  );

  /**
   * Check cache for recent result (within 5 seconds).
   */
  const getCachedResult = useCallback(
    (key: string): ContractStateComparisonResult | null => {
      const cache = comparisonCacheRef.current;
      if (!cache || cache.key !== key) {
        return null;
      }

      const now = Date.now();
      const age = now - cache.timestamp;

      // Cache valid for 5 seconds
      if (age > 5000) {
        comparisonCacheRef.current = null;
        return null;
      }

      return cache.result;
    },
    [],
  );

  /**
   * Update cache with new result.
   */
  const updateCache = useCallback(
    (key: string, result: ContractStateComparisonResult) => {
      comparisonCacheRef.current = {
        key,
        result,
        timestamp: Date.now(),
      };
    },
    [],
  );

  /**
   * Load available contracts for selection dropdown.
   */
  const loadAvailableContracts = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const signal = new AbortController().signal;
      const contracts = await getAvailableContractsForReconciliation(
        session.token,
        signal,
      );

      setState((prev) => ({
        ...prev,
        availableContracts: contracts,
      }));
    } catch (error) {
      // Log but don't block UI; allow manual contract entry
      console.error("Failed to load available contracts:", error);
    }
  }, [session]);

  /**
   * Perform the digest comparison.
   *
   * Handles all error conditions, cache hits, request deduplication,
   * and freshness tracking per the design spec.
   */
  const performComparison = useCallback(async () => {
    if (!isAuthorized()) {
      setState((prev) => ({
        ...prev,
        error: {
          code: "AUTHORIZATION_DENIED",
          message:
            "You do not have permission to run reconciliation comparisons. Only ADMIN and ISSUER roles are authorized.",
        },
      }));
      return;
    }

    if (!state.selectedNetwork || !state.selectedContractAddress) {
      setState((prev) => ({
        ...prev,
        error: {
          code: "UNKNOWN_ERROR",
          message: "Please select both network and contract before comparing.",
        },
      }));
      return;
    }

    // Check cache first
    const cacheKey = generateCacheKey(
      state.selectedNetwork,
      state.selectedContractAddress,
    );
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      setState((prev) => ({
        ...prev,
        result: cachedResult,
        error: null,
        isLoading: false,
      }));
      return;
    }

    // Increment request counter for out-of-order guard
    const thisRequestId = ++requestCounterRef.current;
    currentRequestRef.current = thisRequestId;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    // Cancel previous request if still in-flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Fetch both backend projection and live digest concurrently
      const [backendProjection, liveDigest] = await Promise.all([
        getBackendContractStateProjection(
          session!.token,
          state.selectedNetwork,
          state.selectedContractAddress,
          signal,
        ),
        getLiveContractStateDigest(
          session!.token,
          state.selectedNetwork,
          state.selectedContractAddress,
          signal,
        ),
      ]);

      // Guard: check if this is still the current request
      if (thisRequestId !== requestCounterRef.current) {
        return; // Out-of-order response, ignore
      }

      // Perform comparison
      const now = new Date().toISOString();
      const comparisonResult = performComparisonV1(
        state.selectedNetwork,
        state.selectedContractAddress,
        backendProjection,
        liveDigest,
        now,
      );

      // Cache result
      updateCache(cacheKey, comparisonResult);

      // Update state only if this is still the current request
      setState((prev) => {
        if (thisRequestId !== requestCounterRef.current) {
          return prev; // Out-of-order, don't update
        }

        return {
          ...prev,
          result: comparisonResult,
          error: comparisonResult.error || null,
          isLoading: false,
          lastComparisonKey: cacheKey,
          lastComparisonTime: Date.now(),
        };
      });
    } catch (error) {
      // Guard: check if this is still the current request
      if (thisRequestId !== requestCounterRef.current) {
        return; // Out-of-order error, ignore
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error during comparison";

      setState((prev) => {
        if (thisRequestId !== requestCounterRef.current) {
          return prev;
        }

        return {
          ...prev,
          error: {
            code:
              errorMessage.includes("Unsupported digest version")
                ? "UNSUPPORTED_DIGEST_VERSION"
                : errorMessage.includes("404")
                  ? "DIGEST_FETCH_FAILED"
                  : errorMessage.includes("Backend")
                    ? "BACKEND_PROJECTION_FETCH_FAILED"
                    : "UNKNOWN_ERROR",
            message: errorMessage,
          },
          isLoading: false,
        };
      });
    }
  }, [
    state.selectedNetwork,
    state.selectedContractAddress,
    isAuthorized,
    generateCacheKey,
    getCachedResult,
    updateCache,
    session,
  ]);

  /**
   * Handle network selection.
   */
  const handleNetworkChange = useCallback(
    (network: NetworkIdentifier) => {
      setState((prev) => ({
        ...prev,
        selectedNetwork: network,
        selectedContractAddress: null, // Reset contract selection
        result: null,
        error: null,
      }));
    },
    [],
  );

  /**
   * Handle contract selection.
   */
  const handleContractChange = useCallback((address: string) => {
    setState((prev) => ({
      ...prev,
      selectedContractAddress: address,
      result: null,
      error: null,
    }));
  }, []);

  /**
   * Load contracts on mount and when session changes.
   */
  useEffect(() => {
    loadAvailableContracts();
  }, [loadAvailableContracts]);

  /**
   * Cleanup abort controller on unmount.
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Authorization check: show access denied if not authorized.
   */
  if (!isAuthorized()) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="font-semibold text-red-900">Access Denied</h3>
        <p className="mt-2 text-sm text-red-700">
          You do not have permission to access the reconciliation tool. Only
          ADMIN and ISSUER roles can perform contract state reconciliation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Network and Contract Selection */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Select Network & Contract
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose the network and contract to reconcile against the backend
          projection.
        </p>

        <div className="mt-6">
          <NetworkContractSelector
            selectedNetwork={state.selectedNetwork}
            selectedContractAddress={state.selectedContractAddress}
            availableContracts={state.availableContracts}
            onNetworkChange={handleNetworkChange}
            onContractChange={handleContractChange}
            onCompare={performComparison}
            isLoading={state.isLoading}
          />
        </div>
      </section>

      {/* Error Display */}
      {state.error && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h3 className="font-semibold text-red-900">
            {state.error.code === "UNSUPPORTED_DIGEST_VERSION"
              ? "Unsupported Digest Version"
              : state.error.code === "CONTRACT_IDENTITY_MISMATCH"
                ? "Contract Mismatch"
                : state.error.code === "NETWORK_MISMATCH"
                  ? "Network Mismatch"
                  : state.error.code === "DIGEST_FETCH_FAILED"
                    ? "Failed to Fetch Live Digest"
                    : state.error.code === "BACKEND_PROJECTION_FETCH_FAILED"
                      ? "Backend Error"
                      : "Comparison Error"}
          </h3>
          <p className="mt-2 text-sm text-red-700">{state.error.message}</p>
          {state.error.details && (
            <pre className="mt-3 overflow-auto rounded bg-red-100 p-3 text-xs text-red-800">
              {JSON.stringify(state.error.details, null, 2)}
            </pre>
          )}
        </section>
      )}

      {/* Comparison Results */}
      {state.result && !state.error && (
        <>
          <ComparisonResults result={state.result} />

          {/* Mismatch Export Section */}
          {state.result.overallStatus === "some-mismatch" && (
            <MismatchExportSection result={state.result} />
          )}
        </>
      )}

      {/* Loading State */}
      {state.isLoading && (
        <section className="rounded-lg border border-slate-200 p-6">
          <div className="flex items-center space-x-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <p className="text-sm text-slate-600">
              Fetching backend projection and live digest...
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
