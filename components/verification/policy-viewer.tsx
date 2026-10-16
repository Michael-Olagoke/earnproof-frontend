"use client";

/**
 * PolicyViewer - Detailed disclosure policy explanation
 *
 * Displays human-readable explanations of:
 * - What data is hidden vs. revealed in the credential
 * - Schema version and network context
 * - Signing key information (abbreviated for safety)
 * - Policy implications and caveats
 *
 * Designed as a focused, reusable sub-component for embedding
 * policy information in verification workflows.
 */

import type { CredentialPolicy } from "@/lib/credentials/policy-validator";

interface PolicyViewerProps {
  policy: CredentialPolicy;
  compact?: boolean;
}

/**
 * Information box component for policy sections.
 */
function PolicyInfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-800/30 p-3">
      <h4 className="text-xs font-semibold uppercase text-slate-300">{title}</h4>
      <div className="mt-2 text-sm text-slate-300">{children}</div>
    </div>
  );
}

/**
 * Single policy fact or statement.
 */
function PolicyFact({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="flex-shrink-0 text-slate-500">▪</span>
      <div className="flex-grow">
        <span className="text-xs font-semibold text-slate-300">{label}:</span>
        <span className="ml-1 text-sm text-slate-300">{value}</span>
      </div>
    </div>
  );
}

/**
 * Disclosure policy explanation section.
 */
function DisclosurePolicySection({ policy }: { policy: CredentialPolicy }) {
  const { disclosurePolicy } = policy;

  return (
    <div className="space-y-3">
      <PolicyInfoBox title="What&apos;s Disclosed">
        <div className="space-y-1">
          <PolicyFact
            label="Income Amount"
            value={
              disclosurePolicy.amountDisclosed ? (
                <span className="text-amber-200">Disclosed</span>
              ) : (
                <span className="text-emerald-200">Hidden</span>
              )
            }
          />
          <p className="text-xs text-slate-400">{disclosurePolicy.amountExplanation}</p>
        </div>
      </PolicyInfoBox>

      <PolicyInfoBox title="Transaction Sources">
        <div className="space-y-1">
          <PolicyFact
            label="Source Details"
            value={
              disclosurePolicy.sourceDisclosed ? (
                <span className="text-amber-200">Disclosed</span>
              ) : (
                <span className="text-emerald-200">Hidden</span>
              )
            }
          />
          <p className="text-xs text-slate-400">{disclosurePolicy.sourceExplanation}</p>
        </div>
      </PolicyInfoBox>

      <div className="rounded-md bg-slate-800/50 p-3">
        <p className="text-sm font-semibold text-slate-200">{disclosurePolicy.summary}</p>
      </div>
    </div>
  );
}

/**
 * Schema and network context section.
 */
function ContextSection({ policy }: { policy: CredentialPolicy }) {
  return (
    <div className="space-y-3">
      <PolicyInfoBox title="Schema Version">
        <div className="space-y-2">
          <PolicyFact
            label="Version"
            value={policy.schemaVersion || "Not specified"}
          />
          <p className="text-xs text-slate-400">{policy.schemaExplanation}</p>
        </div>
      </PolicyInfoBox>

      <PolicyInfoBox title="Network & Signing">
        <div className="space-y-2">
          {policy.network && (
            <PolicyFact label="Network" value={policy.network} />
          )}
          {policy.proofType && (
            <PolicyFact label="Proof Type" value={policy.proofType} />
          )}
          {policy.signingKeyId && (
            <PolicyFact label="Signing Key" value={policy.signingKeyId} />
          )}
          <p className="text-xs text-slate-400">{policy.networkExplanation}</p>
        </div>
      </PolicyInfoBox>
    </div>
  );
}

/**
 * Warnings and caveats section.
 */
function WarningsSection({ policy }: { policy: CredentialPolicy }) {
  if (policy.warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {policy.warnings.map((warning, idx) => {
        const styles: Record<typeof warning.level, string> = {
          info: "border-blue-900/50 bg-blue-900/20 text-blue-200",
          caution: "border-amber-900/50 bg-amber-900/20 text-amber-200",
          warning: "border-rose-900/50 bg-rose-900/20 text-rose-200",
        };

        const icons: Record<typeof warning.level, string> = {
          info: "ℹ",
          caution: "⚠",
          warning: "✕",
        };

        return (
          <div key={idx} className={`rounded-md border px-3 py-2 text-sm ${styles[warning.level]}`}>
            <span className="mr-2 font-semibold">{icons[warning.level]}</span>
            {warning.message}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact policy display (inline summary).
 */
function CompactPolicyView({ policy }: { policy: CredentialPolicy }) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-slate-700/50 bg-slate-800/30 p-3">
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-slate-200">Disclosure:</span> {policy.disclosurePolicy.summary}
        </p>
      </div>

      {policy.warnings.length > 0 && (
        <div className="space-y-1">
          {policy.warnings.slice(0, 2).map((warning, idx) => {
            const styles: Record<typeof warning.level, string> = {
              info: "border-blue-900/50 bg-blue-900/20 text-blue-200",
              caution: "border-amber-900/50 bg-amber-900/20 text-amber-200",
              warning: "border-rose-900/50 bg-rose-900/20 text-rose-200",
            };

            return (
              <div key={idx} className={`rounded-md border px-2 py-1 text-xs ${styles[warning.level]}`}>
                {warning.message}
              </div>
            );
          })}
          {policy.warnings.length > 2 && (
            <p className="text-xs text-slate-500">+{policy.warnings.length - 2} more warning{policy.warnings.length - 2 > 1 ? "s" : ""}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Main PolicyViewer component.
 */
export function PolicyViewer({ policy, compact = false }: PolicyViewerProps) {
  if (compact) {
    return <CompactPolicyView policy={policy} />;
  }

  return (
    <div className="space-y-4">
      {/* Disclosure Policy Section */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300">Disclosure Policy</h3>
        <DisclosurePolicySection policy={policy} />
      </div>

      {/* Context Section */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300">Schema & Network Context</h3>
        <ContextSection policy={policy} />
      </div>

      {/* Warnings Section */}
      {policy.warnings.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300">Notices & Warnings</h3>
          <WarningsSection policy={policy} />
        </div>
      )}

      {/* Privacy Notice */}
      <div className="border-t border-slate-700/50 pt-4">
        <p className="text-xs text-slate-500">
          This policy viewer explains what data is disclosed in this credential. The actual proof verification
          happens cryptographically on the issuer&apos;s network and is independent of these disclosure flags.
        </p>
      </div>
    </div>
  );
}
