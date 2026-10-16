/**
 * Policy validator for credential disclosure policies.
 *
 * This module provides functions to:
 * 1. Analyze and explain disclosure policies (what's hidden vs revealed)
 * 2. Extract signing key ID from credential metadata
 * 3. Explain schema version implications
 * 4. Describe network context for the credential
 * 5. Provide human-readable explanations of policy rules
 */

import { ExportableCredential, ExportableProof } from "./export";
import { isKnownSchemaVersion } from "./schema-inspector";

/**
 * Disclosure policy explaining what data is hidden/revealed in a credential.
 */
export interface DisclosurePolicy {
  amountDisclosed: boolean;
  amountExplanation: string;
  sourceDisclosed: boolean;
  sourceExplanation: string;
  summary: string;
}

/**
 * Credential policy metadata including schema, network, and signing info.
 */
export interface CredentialPolicy {
  schemaVersion: string | null;
  schemaExplanation: string;
  proofType: string | null;
  network: string | null;
  networkExplanation: string;
  signingKeyId: string | null;
  disclosurePolicy: DisclosurePolicy;
  warnings: PolicyWarning[];
  summary: string;
}

/**
 * Warning about policy implications or potential issues.
 */
export interface PolicyWarning {
  level: "info" | "caution" | "warning";
  message: string;
}

/**
 * Analyze and explain the disclosure policy of a credential.
 *
 * @param credential - The credential to analyze
 * @returns DisclosurePolicy object explaining what's hidden/revealed
 */
export function analyzeDisclosurePolicy(
  credential: ExportableCredential | undefined
): DisclosurePolicy {
  if (!credential) {
    return {
      amountDisclosed: false,
      amountExplanation: "No credential data available",
      sourceDisclosed: false,
      sourceExplanation: "No credential data available",
      summary: "No disclosure policy available",
    };
  }

  const { privacy, claim } = credential;

  // Determine amount disclosure
  const exactIncomeHidden = privacy?.exactIncomeHidden ?? true;
  const amountInClaim = Boolean(claim?.amount);
  const amountDisclosed = !exactIncomeHidden || amountInClaim;

  let amountExplanation: string;
  if (exactIncomeHidden && !amountInClaim) {
    amountExplanation = "The exact income amount is hidden. Only the threshold comparison is revealed.";
  } else if (!exactIncomeHidden && amountInClaim) {
    amountExplanation = "The exact income amount is disclosed in this credential.";
  } else if (!exactIncomeHidden && !amountInClaim) {
    amountExplanation = "The exact income amount is marked as disclosed, but the value is not included.";
  } else {
    amountExplanation = "The exact income amount is hidden and not included in the credential.";
  }

  // Determine source disclosure
  const sourceTransactionsHidden = privacy?.sourceTransactionsHidden ?? true;
  const sourceInClaim = Boolean(claim?.sender || claim?.sourceAddress);
  const sourceDisclosed = !sourceTransactionsHidden || sourceInClaim;

  let sourceExplanation: string;
  if (sourceTransactionsHidden && !sourceInClaim) {
    sourceExplanation = "Transaction sources are hidden. Only payment counts are revealed.";
  } else if (!sourceTransactionsHidden && sourceInClaim) {
    sourceExplanation = "Transaction sources are disclosed in this credential.";
  } else if (!sourceTransactionsHidden && !sourceInClaim) {
    sourceExplanation = "Transaction sources are marked as disclosed, but the details are not included.";
  } else {
    sourceExplanation = "Transaction sources are hidden and not included in the credential.";
  }

  // Build summary
  const disclosures: string[] = [];
  if (amountDisclosed) {
    disclosures.push("amount");
  }
  if (sourceDisclosed) {
    disclosures.push("sources");
  }

  let summary: string;
  if (disclosures.length === 0) {
    summary = "Maximum privacy: Only proof type and payment count are revealed.";
  } else if (disclosures.length === 2) {
    summary = "Standard disclosure: Amount and sources are revealed.";
  } else if (disclosures[0] === "amount") {
    summary = "Partial disclosure: Income amount is revealed, but not transaction sources.";
  } else {
    summary = "Partial disclosure: Transaction sources are revealed, but not the exact amount.";
  }

  return {
    amountDisclosed,
    amountExplanation,
    sourceDisclosed,
    sourceExplanation,
    summary,
  };
}

/**
 * Extract signing key ID from credential if available.
 *
 * @param credential - The credential to extract from
 * @returns The signing key ID or null if not available
 *
 * The signing key ID is derived from the proof metadata. In some systems,
 * this might be a key fingerprint, key ID, or issuer-specific identifier.
 * For now, we return the proof type as a proxy until explicit key IDs are
 * available in the proof structure.
 */
export function extractSigningKeyId(credential: ExportableCredential | undefined): string | null {
  if (!credential?.proof?.credentialHash) {
    return null;
  }

  // Use first 16 characters of credential hash as a key identifier
  // This provides a stable reference without exposing the full hash
  return credential.proof.credentialHash.substring(0, 16);
}

/**
 * Extract proof type from credential if available.
 *
 * @param credential - The credential to extract from
 * @returns The proof type (e.g., "Ed25519Signature2020") or null
 */
export function extractProofType(credential: ExportableCredential | undefined): string | null {
  return credential?.proof?.type ?? null;
}

/**
 * Explain the schema version and its implications.
 *
 * @param schemaVersion - The schema version to explain
 * @returns Human-readable explanation of the schema version
 */
export function explainSchemaVersion(schemaVersion: string | null | undefined): string {
  if (!schemaVersion) {
    return "Schema version is not specified.";
  }

  const isKnown = isKnownSchemaVersion(schemaVersion);

  if (schemaVersion === "1" || schemaVersion === "1.0" || schemaVersion === "1.0.0") {
    return "This credential uses schema version 1, the current standard for recurring income proofs.";
  }

  if (!isKnown) {
    return `This credential uses schema version ${schemaVersion}, which is not a recognized standard version. ` +
           `This may indicate a newer version or a custom schema. Verify compatibility before use.`;
  }

  return `This credential uses schema version ${schemaVersion}.`;
}

/**
 * Explain the network context for a credential.
 *
 * @param network - The network identifier (e.g., "stellar", "stellar-testnet")
 * @returns Human-readable explanation of the network
 */
export function explainNetwork(network: string | null | undefined): string {
  if (!network) {
    return "Network is not specified.";
  }

  switch (network.toLowerCase()) {
    case "stellar":
    case "stellar-mainnet":
      return "This credential is secured on the Stellar mainnet, the production blockchain network.";
    case "stellar-testnet":
      return "This credential is secured on the Stellar testnet, a test blockchain network for development.";
    case "stellar-public":
      return "This credential is secured on the Stellar public network.";
    default:
      return `This credential uses the "${network}" network.`;
  }
}

/**
 * Analyze complete policy information for a credential.
 *
 * @param credential - The credential to analyze
 * @param proof - Optional proof summary with network info
 * @returns CredentialPolicy with all policy information and warnings
 */
export function analyzeCredentialPolicy(
  credential: ExportableCredential | undefined,
  proof: ExportableProof | undefined
): CredentialPolicy {
  const warnings: PolicyWarning[] = [];
  const disclosurePolicy = analyzeDisclosurePolicy(credential);
  const schemaVersion = credential?.schemaVersion ?? null;
  const proofType = extractProofType(credential);
  const signingKeyId = extractSigningKeyId(credential);
  const network = proof?.network ?? null;

  // Validation checks
  if (!schemaVersion) {
    warnings.push({
      level: "caution",
      message: "Schema version is missing. This credential may not be from a recognized issuer.",
    });
  }

  if (!proofType) {
    warnings.push({
      level: "caution",
      message: "Proof type is missing. Unable to verify the signature scheme.",
    });
  }

  if (!network && proof) {
    warnings.push({
      level: "info",
      message: "Network information is not available for this credential.",
    });
  }

  // Check revocation status
  if (proof?.revokedAt) {
    warnings.push({
      level: "warning",
      message: `This credential was revoked on ${new Date(proof.revokedAt).toLocaleDateString()}.`,
    });
  }

  // Check expiration
  if (credential?.expiresAt) {
    const expiresAt = new Date(credential.expiresAt);
    const now = new Date();

    if (expiresAt < now) {
      warnings.push({
        level: "warning",
        message: "This credential has expired.",
      });
    } else {
      const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 7) {
        warnings.push({
          level: "caution",
          message: `This credential expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}.`,
        });
      }
    }
  }

  // Check for unusual disclosure combinations
  if (!disclosurePolicy.amountDisclosed && !disclosurePolicy.sourceDisclosed) {
    // This is fine - maximum privacy
  } else if (disclosurePolicy.amountDisclosed && !disclosurePolicy.sourceDisclosed) {
    // Check if amount is disclosed but source is hidden - unusual but valid
    if (!credential?.privacy?.sourceTransactionsHidden) {
      warnings.push({
        level: "info",
        message: "This credential discloses income amount but hides transaction sources.",
      });
    }
  }

  const schemaExplanation = explainSchemaVersion(schemaVersion);
  const networkExplanation = explainNetwork(network);

  // Build comprehensive summary
  const summaryParts: string[] = [];
  summaryParts.push(disclosurePolicy.summary);
  if (schemaVersion && isKnownSchemaVersion(schemaVersion)) {
    summaryParts.push("Schema is recognized and standard.");
  }
  if (network) {
    summaryParts.push(`Secured on ${network.toLowerCase()}.`);
  }

  const summary = summaryParts.join(" ");

  return {
    schemaVersion,
    schemaExplanation,
    proofType,
    network,
    networkExplanation,
    signingKeyId,
    disclosurePolicy,
    warnings,
    summary,
  };
}

/**
 * Format a signing key ID for display (abbreviated).
 *
 * @param keyId - The full key ID
 * @param maxLength - Maximum length to display (default: 12)
 * @returns Abbreviated key ID with ellipsis if truncated
 */
export function formatKeyIdForDisplay(keyId: string | null | undefined, maxLength: number = 12): string {
  if (!keyId) {
    return "Unknown";
  }

  if (keyId.length <= maxLength) {
    return keyId;
  }

  return keyId.substring(0, maxLength) + "…";
}

/**
 * Get a human-friendly label for a disclosure policy.
 *
 * @param policy - The disclosure policy to label
 * @returns A short label describing the policy level
 */
export function getPolicyLabel(policy: DisclosurePolicy): string {
  if (!policy.amountDisclosed && !policy.sourceDisclosed) {
    return "Maximum Privacy";
  } else if (policy.amountDisclosed && policy.sourceDisclosed) {
    return "Standard Disclosure";
  } else if (policy.amountDisclosed) {
    return "Amount Disclosed";
  } else {
    return "Sources Disclosed";
  }
}

/**
 * Get a severity level for a list of policy warnings.
 *
 * @param warnings - The warnings to evaluate
 * @returns "error", "warning", "caution", or "info"
 */
export function getWarningsSeverity(warnings: PolicyWarning[]): "error" | "warning" | "caution" | "info" {
  if (warnings.some((w) => w.level === "warning")) {
    return "warning";
  }
  if (warnings.some((w) => w.level === "caution")) {
    return "caution";
  }
  if (warnings.some((w) => w.level === "info")) {
    return "info";
  }
  return "info";
}
