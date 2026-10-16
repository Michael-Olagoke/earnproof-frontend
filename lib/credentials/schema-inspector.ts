/**
 * Credential schema inspection utilities for safe metadata rendering.
 *
 * This module provides functions to:
 * 1. Analyze credential schema versions and identify known vs unknown fields
 * 2. Extract allowlisted metadata safe for structured inspection
 * 3. Detect and handle malformed credentials with bounded error messages
 * 4. Prevent private claims and signature data from being exposed unsafely
 */

import { ExportableCredential, ExportableProof } from "./export";

/**
 * Schema versions we know about and can inspect safely.
 * Unknown versions are handled gracefully without exposing unvalidated fields.
 */
export const KNOWN_SCHEMA_VERSIONS = ["1", "1.0", "1.0.0"] as const;
export type KnownSchemaVersion = (typeof KNOWN_SCHEMA_VERSIONS)[number];

export function isKnownSchemaVersion(version: unknown): version is KnownSchemaVersion {
  return typeof version === "string" && KNOWN_SCHEMA_VERSIONS.includes(version as KnownSchemaVersion);
}

/**
 * Allowlisted metadata fields that can be safely displayed in the inspector.
 * These are credential metadata fields (not claim content) that are safe to render.
 */
export const INSPECTOR_METADATA_FIELDS = [
  "id",
  "type",
  "schemaVersion",
  "issuer",
  "issuedAt",
  "expiresAt",
] as const;

export const INSPECTOR_SUBJECT_FIELDS = ["walletHash"] as const;

export const INSPECTOR_PROOF_FIELDS = [
  "type",
  "credentialHash", // Hash (not raw signature data)
] as const;

export const INSPECTOR_PRIVACY_FIELDS = ["exactIncomeHidden", "sourceTransactionsHidden"] as const;

export const INSPECTOR_PROOF_METADATA_FIELDS = ["type", "schemaVersion", "network", "issuedAt", "expiresAt"] as const;

/**
 * Result of schema inspection for a credential.
 */
export interface SchemaInspectionResult {
  isValid: boolean;
  hasErrors: boolean;
  errors: string[];
  schemaVersion: string | null;
  isKnownVersion: boolean;
  credentialType: string | null;
  knownFields: Record<string, unknown>;
  unknownFields: string[];
  hasPrivateData: boolean;
  privacyFlags: {
    exactIncomeHidden: boolean | null;
    sourceTransactionsHidden: boolean | null;
  };
}

/**
 * Bounded error collector for malformed credentials.
 * Errors are normalized and have a maximum count to prevent log flooding.
 */
class ErrorCollector {
  private errors: string[] = [];
  private readonly maxErrors = 10;

  add(message: string): void {
    if (this.errors.length < this.maxErrors) {
      this.errors.push(message);
    } else if (this.errors.length === this.maxErrors) {
      this.errors.push("(additional errors truncated)");
    }
  }

  get list(): string[] {
    return this.errors;
  }

  get count(): number {
    return this.errors.length;
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

/**
 * Inspect a credential for schema validity and metadata content.
 *
 * @param credential - The credential to inspect
 * @returns SchemaInspectionResult with validation status and safe metadata
 *
 * This function:
 * - Validates basic structure without exposing raw content
 * - Only exposes allowlisted metadata fields
 * - Flags unknown fields without rendering them
 * - Detects privacy flags but doesn't expose sensitive claim content
 * - Returns bounded error messages for malformed input
 */
export function inspectCredentialSchema(credential: unknown): SchemaInspectionResult {
  const errors = new ErrorCollector();
  const knownFields: Record<string, unknown> = {};
  const unknownFields: Set<string> = new Set();
  let hasPrivateData = false;

  // Type validation
  if (credential === null || typeof credential !== "object") {
    errors.add("Credential must be an object");
    return {
      isValid: false,
      hasErrors: true,
      errors: errors.list,
      schemaVersion: null,
      isKnownVersion: false,
      credentialType: null,
      knownFields: {},
      unknownFields: [],
      hasPrivateData: false,
      privacyFlags: { exactIncomeHidden: null, sourceTransactionsHidden: null },
    };
  }

  const cred = credential as Record<string, unknown>;

  // Extract and validate top-level metadata
  const schemaVersion = typeof cred.schemaVersion === "string" ? cred.schemaVersion : null;
  const isKnownVersion = schemaVersion ? isKnownSchemaVersion(schemaVersion) : false;

  if (!schemaVersion) {
    errors.add("Missing or invalid schemaVersion");
  } else if (!isKnownVersion) {
    // Unknown schema version - still extract known fields but flag it
  }

  const credentialType = typeof cred.type === "string" ? cred.type : null;
  if (!credentialType) {
    errors.add("Missing or invalid type");
  }

  // Extract allowlisted metadata fields
  for (const field of INSPECTOR_METADATA_FIELDS) {
    if (field in cred) {
      const value = cred[field];
      // Only include if value is a primitive (string, number, boolean, null)
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        knownFields[field] = value;
      }
    }
  }

  // Extract subject.walletHash
  if (cred.subject && typeof cred.subject === "object") {
    const subject = cred.subject as Record<string, unknown>;
    if ("walletHash" in subject && typeof subject.walletHash === "string") {
      knownFields["subject.walletHash"] = subject.walletHash;
    }
  }

  // Extract proof metadata (but not signature content)
  if (cred.proof && typeof cred.proof === "object") {
    const proof = cred.proof as Record<string, unknown>;
    for (const field of INSPECTOR_PROOF_FIELDS) {
      if (field in proof) {
        const value = proof[field];
        if (typeof value === "string" || typeof value === "number") {
          knownFields[`proof.${field}`] = value;
        }
      }
    }
    // Flag if signature is present (but don't include it)
    if ("signature" in proof) {
      hasPrivateData = true;
    }
  }

  // Extract privacy flags
  let exactIncomeHidden: boolean | null = null;
  let sourceTransactionsHidden: boolean | null = null;

  if (cred.privacy && typeof cred.privacy === "object") {
    const privacy = cred.privacy as Record<string, unknown>;
    if ("exactIncomeHidden" in privacy && typeof privacy.exactIncomeHidden === "boolean") {
      exactIncomeHidden = privacy.exactIncomeHidden;
      knownFields["privacy.exactIncomeHidden"] = exactIncomeHidden;
    }
    if ("sourceTransactionsHidden" in privacy && typeof privacy.sourceTransactionsHidden === "boolean") {
      sourceTransactionsHidden = privacy.sourceTransactionsHidden;
      knownFields["privacy.sourceTransactionsHidden"] = sourceTransactionsHidden;
    }
  }

  // Detect claim data (should not be rendered in inspector)
  if ("claim" in cred && cred.claim !== undefined) {
    hasPrivateData = true;
  }

  // Collect unknown top-level fields
  const expectedFields = new Set([
    ...INSPECTOR_METADATA_FIELDS,
    "subject",
    "claim",
    "privacy",
    "proof",
  ]);

  for (const field of Object.keys(cred)) {
    if (!expectedFields.has(field)) {
      unknownFields.add(field);
    }
  }

  return {
    isValid: !errors.hasErrors && isKnownVersion,
    hasErrors: errors.hasErrors,
    errors: errors.list,
    schemaVersion,
    isKnownVersion,
    credentialType,
    knownFields,
    unknownFields: Array.from(unknownFields).sort(),
    hasPrivateData,
    privacyFlags: {
      exactIncomeHidden,
      sourceTransactionsHidden,
    },
  };
}

/**
 * Inspect a proof summary for schema validity.
 *
 * @param proof - The proof to inspect
 * @returns SchemaInspectionResult for the proof
 */
export function inspectProofSchema(proof: unknown): SchemaInspectionResult {
  const errors = new ErrorCollector();
  const knownFields: Record<string, unknown> = {};
  const unknownFields: Set<string> = new Set();

  // Type validation
  if (proof === null || typeof proof !== "object") {
    errors.add("Proof must be an object");
    return {
      isValid: false,
      hasErrors: true,
      errors: errors.list,
      schemaVersion: null,
      isKnownVersion: false,
      credentialType: null,
      knownFields: {},
      unknownFields: [],
      hasPrivateData: false,
      privacyFlags: { exactIncomeHidden: null, sourceTransactionsHidden: null },
    };
  }

  const prf = proof as Record<string, unknown>;

  // Extract and validate schema metadata
  const schemaVersion = typeof prf.schemaVersion === "string" ? prf.schemaVersion : null;
  const isKnownVersion = schemaVersion ? isKnownSchemaVersion(schemaVersion) : false;

  if (!schemaVersion) {
    errors.add("Missing or invalid schemaVersion");
  }

  // Extract allowlisted proof metadata fields
  for (const field of INSPECTOR_PROOF_METADATA_FIELDS) {
    if (field in prf) {
      const value = prf[field];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        knownFields[field] = value;
      }
    }
  }

  // Collect unknown fields
  const expectedFields = new Set(INSPECTOR_PROOF_METADATA_FIELDS);

  for (const field of Object.keys(prf)) {
    if (!expectedFields.has(field)) {
      unknownFields.add(field);
    }
  }

  return {
    isValid: !errors.hasErrors && isKnownVersion,
    hasErrors: errors.hasErrors,
    errors: errors.list,
    schemaVersion,
    isKnownVersion,
    credentialType: prf.type ? String(prf.type) : null,
    knownFields,
    unknownFields: Array.from(unknownFields).sort(),
    hasPrivateData: false,
    privacyFlags: { exactIncomeHidden: null, sourceTransactionsHidden: null },
  };
}

/**
 * Extract safe metadata fields from a credential for inspector display.
 *
 * @param credential - The exportable credential
 * @returns Object containing only safe, allowlisted fields
 */
export function extractInspectorMetadata(credential: ExportableCredential | undefined): Record<string, unknown> {
  if (!credential) {
    return {};
  }

  const metadata: Record<string, unknown> = {};

  // Top-level metadata
  for (const field of INSPECTOR_METADATA_FIELDS) {
    if (field in credential && credential[field as keyof ExportableCredential] !== undefined) {
      metadata[field] = credential[field as keyof ExportableCredential];
    }
  }

  // Subject metadata
  if (credential.subject?.walletHash) {
    metadata["subject.walletHash"] = credential.subject.walletHash;
  }

  // Proof metadata (credentialHash only, not signature)
  if (credential.proof) {
    if (credential.proof.type) metadata["proof.type"] = credential.proof.type;
    if (credential.proof.credentialHash) metadata["proof.credentialHash"] = credential.proof.credentialHash;
  }

  // Privacy flags
  if (credential.privacy) {
    if (credential.privacy.exactIncomeHidden !== undefined) {
      metadata["privacy.exactIncomeHidden"] = credential.privacy.exactIncomeHidden;
    }
    if (credential.privacy.sourceTransactionsHidden !== undefined) {
      metadata["privacy.sourceTransactionsHidden"] = credential.privacy.sourceTransactionsHidden;
    }
  }

  return metadata;
}

/**
 * Extract safe metadata from a proof for inspector display.
 *
 * @param proof - The exportable proof
 * @returns Object containing only safe, allowlisted fields
 */
export function extractProofInspectorMetadata(proof: ExportableProof | undefined): Record<string, unknown> {
  if (!proof) {
    return {};
  }

  const metadata: Record<string, unknown> = {};

  for (const field of INSPECTOR_PROOF_METADATA_FIELDS) {
    if (field in proof && proof[field as keyof ExportableProof] !== undefined) {
      metadata[field] = proof[field as keyof ExportableProof];
    }
  }

  return metadata;
}

/**
 * Check if a credential contains unexported private data.
 *
 * @param credential - The credential to check
 * @returns true if credential has claim, signature, or other private data
 */
export function hasPrivateData(credential: unknown): boolean {
  if (credential === null || typeof credential !== "object") {
    return false;
  }

  const cred = credential as Record<string, unknown>;

  // Check for claim data
  if ("claim" in cred && cred.claim !== undefined) {
    return true;
  }

  // Check for signature (proof data should only have hash)
  if (cred.proof && typeof cred.proof === "object") {
    const proof = cred.proof as Record<string, unknown>;
    if ("signature" in proof && proof.signature !== undefined) {
      return true;
    }
  }

  return false;
}
