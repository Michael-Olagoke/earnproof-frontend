"use client";

/**
 * Comparison results display component.
 *
 * Shows component-level comparison results, freshness info,
 * and staleness warnings.
 */

import React, { useMemo } from "react";
import type { ContractStateComparisonResult } from "@/lib/reconciliation/types";

interface ComparisonResultsProps {
  result: ContractStateComparisonResult;
}

/**
 * Format milliseconds as human-readable age string.
 */
function formatAge(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  return `${Math.round(ms / 60000)}m`;
}

/**
 * Format ISO timestamp for display.
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function ComparisonResults(
  props: ComparisonResultsProps,
): React.ReactElement {
  const { result } = props;

  /**
   * Determine status color and label.
   */
  const statusInfo = useMemo(() => {
    if (result.overallStatus === "all-match") {
      return {
        label: "All Components Match",
        color: "green",
        icon: "✓",
      };
    }
    if (result.overallStatus === "some-mismatch") {
      return {
        label: `${result.mismatches.length} Component(s) Mismatch`,
        color: "red",
        icon: "✗",
      };
    }
    return {
      label: "Error",
      color: "slate",
      icon: "!",
    };
  }, [result.overallStatus, result.mismatches.length]);

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <section className="rounded-lg border border-slate-200 p-6">
        <div className="flex items-center space-x-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white ${
              statusInfo.color === "green"
                ? "bg-green-500"
                : statusInfo.color === "red"
                  ? "bg-red-500"
                  : "bg-slate-400"
            }`}
          >
            {statusInfo.icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {statusInfo.label}
            </h2>
            <p className="text-sm text-slate-600">
              Contract: {result.contractAddress}
            </p>
          </div>
        </div>
      </section>

      {/* Freshness Information */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900">Data Freshness</h3>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {/* Backend Projection */}
          <div
            className={`rounded-md border p-4 ${
              result.freshness.isBackendStale
                ? "border-yellow-200 bg-yellow-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-sm font-medium text-slate-900">
              Backend Projection
            </p>
            <p className="mt-2 text-xs text-slate-600">
              As of:{" "}
              <span className="font-mono">
                {formatTimestamp(result.freshness.backendProjectionAsOf)}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Age:{" "}
              <span className="font-semibold">
                {formatAge(result.freshness.backendProjectionAge)}
              </span>
            </p>
            {result.freshness.isBackendStale && (
              <p className="mt-2 text-xs font-medium text-yellow-700">
                ⚠ Backend projection is stale (> 60s). A mismatch may resolve
                when the projection is refreshed.
              </p>
            )}
          </div>

          {/* Live Digest */}
          <div
            className={`rounded-md border p-4 ${
              result.freshness.isLiveDigestStale
                ? "border-yellow-200 bg-yellow-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-sm font-medium text-slate-900">Live Digest</p>
            <p className="mt-2 text-xs text-slate-600">
              Fetched:{" "}
              <span className="font-mono">
                {formatTimestamp(result.freshness.liveDigestFetchedAt)}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Age:{" "}
              <span className="font-semibold">
                {formatAge(result.freshness.liveDigestAge)}
              </span>
            </p>
            {result.freshness.isLiveDigestStale && (
              <p className="mt-2 text-xs font-medium text-yellow-700">
                ⚠ Live digest fetch is aged (> 30s). Consider re-fetching for
                more recent data.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Component-Level Comparison */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900">Component Comparison</h3>
        <div className="mt-4 space-y-3">
          {result.componentComparisons.map((comparison) => (
            <div
              key={comparison.name}
              className={`rounded-md border p-4 ${
                comparison.status === "match"
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className={`text-sm font-medium ${
                      comparison.status === "match"
                        ? "text-green-900"
                        : "text-red-900"
                    }`}
                  >
                    {comparison.name}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      comparison.status === "match"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    Status:{" "}
                    <span className="font-semibold">
                      {comparison.status === "match" ? "Match" : "Mismatch"}
                    </span>
                  </p>
                </div>
                <div
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    comparison.status === "match"
                      ? "bg-green-200 text-green-900"
                      : "bg-red-200 text-red-900"
                  }`}
                >
                  {comparison.status === "match" ? "✓" : "✗"}
                </div>
              </div>

              {comparison.status === "mismatch" && (
                <div className="mt-3 space-y-2 border-t border-red-200 pt-3">
                  <div className="text-xs">
                    <p className="font-medium text-red-900">Backend Digest:</p>
                    <p className="mt-1 break-all font-mono text-red-700">
                      {comparison.backendDigest}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-red-900">Live Digest:</p>
                    <p className="mt-1 break-all font-mono text-red-700">
                      {comparison.liveDigest}
                    </p>
                  </div>
                </div>
              )}

              <p className="mt-2 text-xs text-slate-500">
                Fetched: {formatTimestamp(comparison.fetchedAt)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Request Metadata */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-600">
          Request ID: <span className="font-mono">{result.requestId}</span>
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Digest Version: <span className="font-semibold">{result.digestVersion}</span>
        </p>
      </section>
    </div>
  );
}
