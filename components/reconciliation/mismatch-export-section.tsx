"use client";

/**
 * Mismatch export UI component.
 *
 * Allows operators to export detected mismatches in JSON or CSV format
 * for offline review and analysis.
 */

import React, { useCallback } from "react";
import type {
  ContractStateComparisonResult,
  MismatchExportData,
  ExportFormat,
} from "@/lib/reconciliation/types";

interface MismatchExportSectionProps {
  result: ContractStateComparisonResult;
}

/**
 * Export mismatch data in the specified format.
 *
 * Converts comparison result to export format suitable for offline review.
 * Includes only non-sensitive data (digests, timestamps, comparison results).
 */
function prepareExportData(
  result: ContractStateComparisonResult,
): MismatchExportData {
  return {
    requestId: result.requestId,
    timestamp: result.timestamp,
    network: result.network,
    contractAddress: result.contractAddress,
    digestVersion: result.digestVersion,
    componentComparisons: result.componentComparisons,
    freshness: result.freshness,
  };
}

/**
 * Format data as JSON string.
 */
function formatAsJSON(data: MismatchExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format data as CSV string.
 *
 * Includes mismatch components in CSV format with headers.
 */
function formatAsCSV(data: MismatchExportData): string {
  const lines: string[] = [];

  // Header comment
  lines.push("# Contract State Digest Comparison - Mismatch Report");
  lines.push(`# Request ID: ${data.requestId}`);
  lines.push(`# Timestamp: ${data.timestamp}`);
  lines.push(`# Network: ${data.network}`);
  lines.push(`# Contract: ${data.contractAddress}`);
  lines.push(`# Digest Version: ${data.digestVersion}`);
  lines.push("");

  // Metadata section
  lines.push("## Freshness Information");
  lines.push(
    `Backend Projection,${data.freshness.backendProjectionAsOf},${data.freshness.backendProjectionAge}ms,${data.freshness.isBackendStale ? "STALE" : "FRESH"}`,
  );
  lines.push(
    `Live Digest,${data.freshness.liveDigestFetchedAt},${data.freshness.liveDigestAge}ms,${data.freshness.isLiveDigestStale ? "STALE" : "FRESH"}`,
  );
  lines.push("");

  // Comparison results table
  lines.push("## Component Comparisons");
  lines.push("Component,Backend Digest,Live Digest,Status,Fetched At");

  for (const comparison of data.componentComparisons) {
    lines.push(
      `"${comparison.name}","${comparison.backendDigest}","${comparison.liveDigest}","${comparison.status}","${comparison.fetchedAt}"`,
    );
  }

  return lines.join("\n");
}

/**
 * Trigger download of file to user's machine.
 */
function downloadFile(content: string, filename: string, mediaType: string) {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MismatchExportSection(
  props: MismatchExportSectionProps,
): React.ReactElement {
  const { result } = props;

  /**
   * Handle JSON export.
   */
  const handleExportJSON = useCallback(() => {
    const data = prepareExportData(result);
    const json = formatAsJSON(data);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `reconciliation-mismatches-${timestamp}.json`;
    downloadFile(json, filename, "application/json");
  }, [result]);

  /**
   * Handle CSV export.
   */
  const handleExportCSV = useCallback(() => {
    const data = prepareExportData(result);
    const csv = formatAsCSV(data);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `reconciliation-mismatches-${timestamp}.csv`;
    downloadFile(csv, filename, "text/csv");
  }, [result]);

  return (
    <section className="rounded-lg border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900">Export Mismatches</h3>
      <p className="mt-2 text-sm text-slate-600">
        Download the detected mismatches for offline review. Only non-sensitive
        comparison results are included (no wallet material or private data).
      </p>

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleExportJSON}
          className="flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
        >
          <span>📄</span> Export as JSON
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
        >
          <span>📊</span> Export as CSV
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Files will be downloaded to your device with a timestamp. No data is
        stored on the server.
      </p>
    </section>
  );
}
