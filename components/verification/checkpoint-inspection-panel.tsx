"use client";

import { useState } from "react";
import { Timestamp } from "@/components/common/timestamp";
import { truncateHash, getFullHash } from "@/lib/credentials/checkpoint-verification";
import type { Checkpoint } from "@/lib/credentials/checkpoint-verification";

export type CheckpointInspectionPanelProps = {
  checkpoint: Checkpoint | null | undefined;
};

/**
 * CheckpointInspectionPanel displays revocation checkpoint data from a verification result.
 *
 * Fields displayed:
 * - Sequence: Merkle tree sequence number
 * - Root: Hash value (truncated with expand/copy)
 * - Algorithm: Hash algorithm used
 * - Ledger: Chain identifier
 * - Observed Time: When checkpoint was fetched
 *
 * This is purely informational context about revocation data recency.
 * Checkpoint freshness never overrides or affects proof validity.
 */
export function CheckpointInspectionPanel({ checkpoint }: CheckpointInspectionPanelProps) {
  const [expandedHash, setExpandedHash] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!checkpoint) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Revocation Checkpoint</h3>
        <p className="text-xs text-slate-400">Checkpoint data not available for this proof</p>
      </div>
    );
  }

  const displayHash = truncateHash(checkpoint.root);
  const fullHash = getFullHash(checkpoint.root);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(fullHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Revocation Checkpoint</h3>

      <dl className="space-y-3 text-sm">
        {/* Sequence */}
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-slate-400">Sequence</dt>
          <dd className="mt-1 text-slate-100">{checkpoint.sequence}</dd>
        </div>

        {/* Algorithm */}
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-slate-400">Algorithm</dt>
          <dd className="mt-1 text-slate-100">{checkpoint.algorithm}</dd>
        </div>

        {/* Root Hash */}
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-slate-400">Root</dt>
          <dd className="mt-1">
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-slate-100 break-all">
                {expandedHash ? fullHash : displayHash}
              </code>
              <button
                onClick={() => setExpandedHash(!expandedHash)}
                className="inline-flex items-center justify-center w-5 h-5 rounded border border-white/15 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
                title={expandedHash ? "Collapse" : "Expand"}
                aria-label={expandedHash ? "Collapse hash" : "Expand hash"}
              >
                {expandedHash ? "−" : "+"}
              </button>
              <button
                onClick={handleCopyHash}
                className="inline-flex items-center justify-center w-5 h-5 rounded border border-white/15 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
                title={copied ? "Copied!" : "Copy full hash"}
                aria-label="Copy full hash"
              >
                {copied ? "✓" : "⊕"}
              </button>
            </div>
          </dd>
        </div>

        {/* Ledger */}
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-slate-400">Ledger</dt>
          <dd className="mt-1 text-slate-100">{checkpoint.ledger}</dd>
        </div>

        {/* Observed Time */}
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase text-slate-400">Observed</dt>
          <dd className="mt-1 text-slate-100">
            <Timestamp value={checkpoint.observedAt} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
