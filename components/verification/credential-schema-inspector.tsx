"use client";

/**
 * CredentialSchemaInspector - Structured metadata viewer for credentials
 *
 * Displays allowlisted credential metadata in a safe, structured format:
 * - Schema version and credential type
 * - Network and proof type information
 * - Issuer and identifier information
 * - Timestamps (issued, expires, revoked)
 * - Disclosure policy flags
 * - Cryptographic hash reference (not the signature)
 *
 * Never exposes:
 * - Private claims (amounts, payment details)
 * - Signature data
 * - Unexpected/unknown fields
 *
 * Unknown fields are flagged but not rendered as trusted metadata.
 */

import { inspectCredentialSchema, inspectProofSchema } from "@/lib/credentials/schema-inspector";
import {
  analyzeCredentialPolicy,
  getPolicyLabel,
  getWarningsSeverity,
  formatKeyIdForDisplay,
} from "@/lib/credentials/policy-validator";
import type { ExportableCredential, ExportableProof } from "@/lib/credentials/export";

interface CredentialSchemaInspectorProps {
  credential: ExportableCredential | undefined;
  proof: ExportableProof | undefined;
}

interface MetadataField {
  label: string;
  value: string | null;
  type: "text" | "timestamp" | "hash" | "hash-short";
}

/**
 * Format a field value for display based on its type.
 */
function formatFieldValue(value: unknown, fieldType: "text" | "timestamp" | "hash" | "hash-short" = "text"): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const strValue = String(value);

  if (fieldType === "timestamp") {
    try {
      const date = new Date(strValue);
      return date.toLocaleString();
    } catch {
      return strValue;
    }
  }

  if (fieldType === "hash-short") {
    return strValue.substring(0, 16) + (strValue.length > 16 ? "…" : "");
  }

  if (fieldType === "hash") {
    return strValue.length > 32 ? strValue.substring(0, 32) + "…" : strValue;
  }

  return strValue;
}

/**
 * MetadataField component - displays a single metadata field.
 */
function MetadataFieldView({ label, value, type }: MetadataField) {
  if (!value) {
    return null;
  }

  return (
    <div className="min-w-0 border-b border-slate-700/50 py-3 first:pt-0 last:border-b-0">
      <dt className="text-xs font-semibold uppercase text-slate-400">{label}</dt>
      <dd
        className={`mt-1 break-words text-slate-200 ${
          type === "hash" || type === "hash-short" ? "font-mono text-xs" : ""
        }`}
        title={type === "hash" || type === "hash-short" ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Warning or info message display.
 */
function WarningMessage({
  level,
  message,
}: {
  level: "info" | "caution" | "warning";
  message: string;
}) {
  const styles: Record<typeof level, string> = {
    info: "border-blue-900/50 bg-blue-900/20 text-blue-200",
    caution: "border-amber-900/50 bg-amber-900/20 text-amber-200",
    warning: "border-rose-900/50 bg-rose-900/20 text-rose-200",
  };

  const icons: Record<typeof level, string> = {
    info: "ℹ",
    caution: "⚠",
    warning: "✕",
  };

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${styles[level]}`}>
      <span className="mr-2 font-semibold">{icons[level]}</span>
      {message}
    </div>
  );
}

/**
 * UnknownFields warning if credential contains unexpected fields.
 */
function UnknownFieldsWarning({ fields }: { fields: string[] }) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <WarningMessage
      level="info"
      message={`Unknown field${fields.length > 1 ? "s" : ""}: ${fields.join(", ")}. These are not rendered as trusted metadata.`}
    />
  );
}

/**
 * Collapsible metadata section.
 */
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-700/30 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-3 px-1 text-left hover:bg-slate-800/30 transition-colors"
      >
        <h3 className="text-sm font-semibold uppercase text-slate-300">{title}</h3>
        <span className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
      </button>
      {isOpen && <div className="px-1 pb-3">{children}</div>}
    </div>
  );
}

/**
 * Main inspector component.
 */
export function CredentialSchemaInspector({
  credential,
  proof,
}: CredentialSchemaInspectorProps) {
  if (!credential) {
    return null;
  }

  // Analyze schemas
  const credentialInspection = inspectCredentialSchema(credential);
  inspectProofSchema(proof);
  const policy = analyzeCredentialPolicy(credential, proof);
  const warningsSeverity = getWarningsSeverity(policy.warnings);

  if (credential.id) {
    metadataFields.push({ label: "Credential ID", value: credential.id, type: "text" });
  }

  if (credential.type) {
    metadataFields.push({ label: "Type", value: credential.type, type: "text" });
  }

  if (credential.schemaVersion) {
    metadataFields.push({ label: "Schema Version", value: credential.schemaVersion, type: "text" });
  }

  if (credential.issuer) {
    metadataFields.push({ label: "Issuer", value: credential.issuer, type: "text" });
  }

  const proofFields: MetadataField[] = [];

  if (proof?.id) {
    proofFields.push({ label: "Proof ID", value: proof.id, type: "text" });
  }

  if (proof?.type) {
    proofFields.push({ label: "Proof Type", value: proof.type, type: "text" });
  }

  if (proof?.network) {
    proofFields.push({ label: "Network", value: proof.network, type: "text" });
  }

  if (credential.subject?.walletHash) {
    proofFields.push({
      label: "Wallet Hash",
      value: credential.subject.walletHash,
      type: "hash",
    });
  }

  const timestampFields: MetadataField[] = [];

  if (credential.issuedAt) {
    timestampFields.push({
      label: "Issued At",
      value: formatFieldValue(credential.issuedAt, "timestamp"),
      type: "text",
    });
  }

  if (credential.expiresAt) {
    timestampFields.push({
      label: "Expires At",
      value: formatFieldValue(credential.expiresAt, "timestamp"),
      type: "text",
    });
  }

  if (proof?.revokedAt) {
    timestampFields.push({
      label: "Revoked At",
      value: formatFieldValue(proof.revokedAt, "timestamp"),
      type: "text",
    });
  }

  const cryptoFields: MetadataField[] = [];

  if (credential.proof?.type) {
    cryptoFields.push({
      label: "Signature Type",
      value: credential.proof.type,
      type: "text",
    });
  }

  if (credential.proof?.credentialHash) {
    cryptoFields.push({
      label: "Credential Hash",
      value: credential.proof.credentialHash,
      type: "hash",
    });
  }

  const signingKeyId = formatKeyIdForDisplay(policy.signingKeyId, 16);
  if (signingKeyId !== "Unknown") {
    cryptoFields.push({
      label: "Signing Key Reference",
      value: signingKeyId,
      type: "hash-short",
    });
  }

  const privacyFields: MetadataField[] = [];

  if (credential.privacy) {
    const policyLabel = getPolicyLabel(policy.disclosurePolicy);
    privacyFields.push({
      label: "Disclosure Policy",
      value: policyLabel,
      type: "text",
    });

    if (credential.privacy.exactIncomeHidden !== undefined) {
      privacyFields.push({
        label: "Amount Hidden",
        value: credential.privacy.exactIncomeHidden ? "Yes" : "No",
        type: "text",
      });
    }

    if (credential.privacy.sourceTransactionsHidden !== undefined) {
      privacyFields.push({
        label: "Sources Hidden",
        value: credential.privacy.sourceTransactionsHidden ? "Yes" : "No",
        type: "text",
      });
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-700/50 bg-slate-900/30 p-4">
      {/* Header with policy summary */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase text-slate-300">Schema Inspector</h3>
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold uppercase ${
              warningsSeverity === "warning"
                ? "border border-rose-900/50 bg-rose-900/20 text-rose-200"
                : warningsSeverity === "caution"
                  ? "border border-amber-900/50 bg-amber-900/20 text-amber-200"
                  : "border border-blue-900/50 bg-blue-900/20 text-blue-200"
            }`}
          >
            {warningsSeverity === "warning" ? "⚠" : warningsSeverity === "caution" ? "⚠" : "ℹ"} {policy.summary}
          </span>
        </div>
      </div>

      {/* Policy warnings */}
      {policy.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {policy.warnings.map((warning, idx) => (
            <WarningMessage key={idx} level={warning.level} message={warning.message} />
          ))}
        </div>
      )}

      {/* Unknown fields warning */}
      <UnknownFieldsWarning fields={credentialInspection.unknownFields} />

      {/* Metadata sections - collapsible */}
      <div className="mt-4 space-y-0">
        {/* Credential Metadata */}
        {metadataFields.length > 0 && (
          <CollapsibleSection
            title={`Credential Metadata (${metadataFields.length})`}
            defaultOpen
          >
            {metadataFields.map((field, idx) => (
              <MetadataFieldView key={idx} {...field} />
            ))}
          </CollapsibleSection>
        )}

        {/* Proof & Network Metadata */}
        {proofFields.length > 0 && (
          <CollapsibleSection title={`Proof & Network (${proofFields.length})`} defaultOpen>
            {proofFields.map((field, idx) => (
              <MetadataFieldView key={idx} {...field} />
            ))}
          </CollapsibleSection>
        )}

        {/* Timestamps */}
        {timestampFields.length > 0 && (
          <CollapsibleSection title={`Timestamps (${timestampFields.length})`} defaultOpen>
            {timestampFields.map((field, idx) => (
              <MetadataFieldView key={idx} {...field} />
            ))}
          </CollapsibleSection>
        )}

        {/* Cryptographic Information */}
        {cryptoFields.length > 0 && (
          <CollapsibleSection title={`Cryptographic Information (${cryptoFields.length})`} defaultOpen={false}>
            {cryptoFields.map((field, idx) => (
              <MetadataFieldView key={idx} {...field} />
            ))}
          </CollapsibleSection>
        )}

        {/* Privacy & Disclosure */}
        {privacyFields.length > 0 && (
          <CollapsibleSection title={`Privacy & Disclosure (${privacyFields.length})`} defaultOpen>
            {privacyFields.map((field, idx) => (
              <MetadataFieldView key={idx} {...field} />
            ))}
            <div className="mt-3 border-t border-slate-700/50 pt-3">
              <p className="text-xs text-slate-400">{policy.disclosurePolicy.summary}</p>
            </div>
          </CollapsibleSection>
        )}

        {/* Policy Explanations */}
        <CollapsibleSection title="Policy Explanations" defaultOpen={false}>
          <div className="space-y-3 text-xs text-slate-300">
            <div>
              <p className="font-semibold text-slate-200">Schema Version</p>
              <p className="mt-1 text-slate-400">{policy.schemaExplanation}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-200">Network</p>
              <p className="mt-1 text-slate-400">{policy.networkExplanation}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-200">Amount Disclosure</p>
              <p className="mt-1 text-slate-400">{policy.disclosurePolicy.amountExplanation}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-200">Source Disclosure</p>
              <p className="mt-1 text-slate-400">{policy.disclosurePolicy.sourceExplanation}</p>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Schema validation info */}
      {credentialInspection.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-rose-900/50 bg-rose-900/20 p-3">
          <p className="text-xs font-semibold text-rose-200">Schema Validation Issues:</p>
          <ul className="mt-2 space-y-1">
            {credentialInspection.errors.map((error, idx) => (
              <li key={idx} className="text-xs text-rose-300">
                • {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Privacy notice */}
      <div className="mt-4 border-t border-slate-700/50 pt-3">
        <p className="text-xs text-slate-500">
          ✓ This inspector displays only allowlisted metadata. Private claims, signatures, and
          unknown fields are never rendered as trusted data.
        </p>
      </div>
    </div>
  );
}
