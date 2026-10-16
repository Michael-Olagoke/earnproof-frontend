/**
 * Integration tests for credential schema and policy inspector feature.
 *
 * Coverage:
 * - End-to-end schema inspection workflow
 * - Policy analysis on verified credentials
 * - Redacted export after inspection
 * - Privacy guarantees across all components
 * - Legacy, current, and unknown schema handling
 * - Error recovery and bounded error messages
 */

import {
  inspectCredentialSchema,
  inspectProofSchema,
  extractInspectorMetadata,
} from "../schema-inspector";
import {
  analyzeCredentialPolicy,
  analyzeDisclosurePolicy,
  getPolicyLabel,
  getWarningsSeverity,
} from "../policy-validator";
import {
  buildCredentialExport,
  buildRedactedCredentialExport,
  collectDisclosureWarnings,
} from "../export";
import type { ExportableCredential, ExportableProof } from "../export";

describe("credential-inspector-integration", () => {
  describe("full workflow: verification to inspection", () => {
    it("inspects and analyzes a valid credential", () => {
      const credential: ExportableCredential = {
        id: "proof-valid-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "https://issuer.example.com",
        subject: { walletHash: "GD4HASH..." },
        claim: {
          operator: "gte",
          thresholdAmount: "1000.00",
          assetCode: "USDC",
          assetIssuer: "GBUQWP3...",
          periodStart: "2024-01-01T00:00:00Z",
          periodEnd: "2024-02-01T00:00:00Z",
          qualifyingPaymentCount: 5,
        },
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: false,
        },
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "abcdef0123456789fedcba9876543210abcdef0123456789",
          signature: "signature-data-here",
        },
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "RecurringIncomeProof",
        schemaVersion: "1",
        network: "stellar",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        revokedAt: null,
      };

      // Step 1: Schema inspection
      const schemaInspection = inspectCredentialSchema(credential);
      expect(schemaInspection.isValid).toBe(true);
      expect(schemaInspection.hasErrors).toBe(false);
      expect(schemaInspection.isKnownVersion).toBe(true);
      expect(schemaInspection.credentialType).toBe("RecurringIncomeCredential");

      // Step 2: Policy analysis
      const policy = analyzeCredentialPolicy(credential, proof);
      expect(policy.schemaVersion).toBe("1");
      expect(policy.network).toBe("stellar");
      expect(policy.disclosurePolicy.amountDisclosed).toBe(true);
      expect(policy.disclosurePolicy.sourceDisclosed).toBe(true);

      // Step 3: Metadata extraction
      const metadata = extractInspectorMetadata(credential);
      expect(metadata.id).toBe("proof-valid-123");
      expect(metadata.type).toBe("RecurringIncomeCredential");
      expect(metadata["subject.walletHash"]).toBe("GD4HASH...");

      // Step 4: Verify privacy is maintained
      expect(metadata.claim).toBeUndefined();
      expect(metadata["proof.signature"]).toBeUndefined();
    });

    it("handles credential with maximum privacy correctly", () => {
      const credential: ExportableCredential = {
        id: "proof-private-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "https://issuer.example.com",
        privacy: {
          exactIncomeHidden: true,
          sourceTransactionsHidden: true,
        },
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
      };

      // Schema inspection
      const schemaInspection = inspectCredentialSchema(credential);
      expect(schemaInspection.isValid).toBe(true);

      // Policy analysis
      const policy = analyzeDisclosurePolicy(credential);
      expect(policy.amountDisclosed).toBe(false);
      expect(policy.sourceDisclosed).toBe(false);
      expect(policy.summary).toContain("Maximum privacy");

      // Metadata extraction
      const metadata = extractInspectorMetadata(credential);
      expect(metadata["privacy.exactIncomeHidden"]).toBe(true);
      expect(metadata["privacy.sourceTransactionsHidden"]).toBe(true);
    });

    it("detects and reports malformed credentials gracefully", () => {
      const malformed = {
        id: "malformed-123",
        // Missing required type and schemaVersion
        invalidField: "should be flagged",
        deepNested: {
          structure: {
            that: "should not crash",
          },
        },
      };

      // Schema inspection
      const schemaInspection = inspectCredentialSchema(malformed);
      expect(schemaInspection.isValid).toBe(false);
      expect(schemaInspection.hasErrors).toBe(true);
      expect(schemaInspection.errors.length).toBeGreaterThan(0);

      // Should still extract what's available
      expect(schemaInspection.knownFields.id).toBe("malformed-123");
      expect(schemaInspection.unknownFields).toContain("invalidField");
    });
  });

  describe("export workflow: standard vs redacted", () => {
    it("produces both standard and redacted exports from same credential", () => {
      const credential: ExportableCredential = {
        id: "cred-export-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
        subject: { walletHash: "wallet-hash-abc" },
        claim: {
          operator: "gte",
          thresholdAmount: "5000",
          assetCode: "USDC",
        },
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: false,
        },
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash-def",
          signature: "sig-xyz",
        },
      };

      // Standard export includes claim data
      const standardPlan = buildCredentialExport({ credential });
      const standardExported = JSON.parse(standardPlan.body);
      expect(standardExported.credential.claim.thresholdAmount).toBe("5000");
      expect(standardExported.credential.proof.signature).toBeDefined();

      // Redacted export excludes claim and signature
      const redactedPlan = buildRedactedCredentialExport({ credential });
      const redactedExported = JSON.parse(redactedPlan.body);
      expect(redactedExported.credential.claim).toBeUndefined();
      expect(redactedExported.credential.proof.signature).toBeUndefined();
      expect(redactedExported.credential.proof.credentialHash).toBe("hash-def");

      // Both should have metadata
      expect(standardExported.credential.id).toBe(redactedExported.credential.id);
      expect(standardExported.credential.schemaVersion).toBe(redactedExported.credential.schemaVersion);
    });

    it("collects disclosure warnings only for standard export", () => {
      const credential: ExportableCredential = {
        id: "cred-warnings-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: false,
        },
        claim: {
          sender: "sender-address",
        },
      };

      // Standard export has warnings
      const standardWarnings = collectDisclosureWarnings(credential);
      expect(standardWarnings.length).toBeGreaterThan(0);

      // Redacted export has warning about redaction
      const redactedPlan = buildRedactedCredentialExport({ credential });
      expect(redactedPlan.warnings.length).toBeGreaterThan(0);
      expect(redactedPlan.warnings[0].message).toContain("redacted");
    });
  });

  describe("schema version handling", () => {
    const versions = ["1", "1.0", "1.0.0"] as const;

    versions.forEach((version) => {
      it(`handles schema version ${version}`, () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: version,
        };

        const inspection = inspectCredentialSchema(credential);

        expect(inspection.schemaVersion).toBe(version);
        expect(inspection.isKnownVersion).toBe(true);
        expect(inspection.isValid).toBe(true);
      });
    });

    it("flags unknown schema versions", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "2.5.0",
      };

      const inspection = inspectCredentialSchema(credential);

      expect(inspection.schemaVersion).toBe("2.5.0");
      expect(inspection.isKnownVersion).toBe(false);
      expect(inspection.isValid).toBe(false);
    });

    it("handles missing schema version", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        // schemaVersion omitted
      };

      const inspection = inspectCredentialSchema(credential);

      expect(inspection.schemaVersion).toBeNull();
      expect(inspection.hasErrors).toBe(true);
    });
  });

  describe("privacy guarantees across workflow", () => {
    it("never exposes signatures in any step", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash-abc",
          signature: "secret-signature-xyz",
        },
      };

      // Schema inspection
      const schemaInspection = inspectCredentialSchema(credential);
      expect(schemaInspection.knownFields["proof.signature"]).toBeUndefined();

      // Metadata extraction
      const metadata = extractInspectorMetadata(credential);
      expect(metadata["proof.signature"]).toBeUndefined();

      // Standard export includes it (for verification)
      const standardPlan = buildCredentialExport({ credential });
      const standardExported = JSON.parse(standardPlan.body);
      expect(standardExported.credential.proof.signature).toBe("secret-signature-xyz");

      // Redacted export excludes it
      const redactedPlan = buildRedactedCredentialExport({ credential });
      const redactedExported = JSON.parse(redactedPlan.body);
      expect(redactedExported.credential.proof.signature).toBeUndefined();
    });

    it("never exposes claim data in schema inspector", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          operator: "gte",
          thresholdAmount: "5000",
          assetCode: "USDC",
          assetIssuer: "issuer-address",
          periodStart: "2024-01-01T00:00:00Z",
          periodEnd: "2024-02-01T00:00:00Z",
          qualifyingPaymentCount: 10,
        },
      };

      // Schema inspection
      const schemaInspection = inspectCredentialSchema(credential);
      expect(schemaInspection.knownFields.claim).toBeUndefined();

      // Metadata extraction
      const metadata = extractInspectorMetadata(credential);
      expect(metadata.claim).toBeUndefined();

      // Redacted export
      const redactedPlan = buildRedactedCredentialExport({ credential });
      const redactedExported = JSON.parse(redactedPlan.body);
      expect(redactedExported.credential.claim).toBeUndefined();
    });

    it("preserves privacy flags but not claim details", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: true,
        },
        claim: {
          amount: "5000",
          sender: "sensitive-address",
        },
      };

      // Policy analysis sees privacy flags AND claim data
      const policy = analyzeDisclosurePolicy(credential);
      expect(policy.amountDisclosed).toBe(true);
      // sourceTransactionsHidden is true but we have sender in claim, so sourceDisclosed is true
      expect(policy.sourceDisclosed).toBe(true);

      // Metadata has privacy flags
      const metadata = extractInspectorMetadata(credential);
      expect(metadata["privacy.exactIncomeHidden"]).toBe(false);
      expect(metadata["privacy.sourceTransactionsHidden"]).toBe(true);

      // But not claim data
      expect(metadata.claim).toBeUndefined();
      expect(metadata["claim.amount"]).toBeUndefined();
      expect(metadata["claim.sender"]).toBeUndefined();
    });
  });

  describe("error handling and recovery", () => {
    it("recovers from null credential", () => {
      const inspection = inspectCredentialSchema(null);

      expect(inspection.isValid).toBe(false);
      expect(inspection.hasErrors).toBe(true);
      expect(inspection.knownFields).toEqual({});

      // Export still works with undefined
      const plan = buildRedactedCredentialExport({ credential: undefined });
      const exported = JSON.parse(plan.body);
      expect(exported.credential).toBeUndefined();
    });

    it("handles circular references gracefully", () => {
      const credential: Record<string, unknown> = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };
      credential.self = credential; // Create circular reference

      const inspection = inspectCredentialSchema(credential);

      // Should not crash
      expect(inspection.isValid).toBe(true);
      expect(inspection.knownFields.id).toBe("cred-123");
    });

    it("bounds error messages to prevent flooding", () => {
      const credential: Record<string, unknown> = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
      };

      // Add many invalid fields
      for (let i = 0; i < 20; i++) {
        credential[`invalidField${i}`] = {
          invalid: "nested",
        };
      }

      const inspection = inspectCredentialSchema(credential);

      expect(inspection.errors.length).toBeLessThanOrEqual(11); // Max 10 + truncation message
    });
  });

  describe("warning and severity handling", () => {
    it("correctly assesses warning severity", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        expiresAt: "2020-01-01T12:00:00Z", // Expired
      };

      const policy = analyzeCredentialPolicy(credential, undefined);

      expect(policy.warnings.length).toBeGreaterThan(0);
      const severity = getWarningsSeverity(policy.warnings);
      expect(severity).toBe("warning");
    });

    it("handles mixed warning levels", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
        revokedAt: "2024-01-15T12:00:00Z", // Revoked
      };

      const policy = analyzeCredentialPolicy(credential, proof);
      const severity = getWarningsSeverity(policy.warnings);

      expect(["info", "caution", "warning"]).toContain(severity);
    });
  });

  describe("policy label generation", () => {
    it("generates correct label for privacy level", () => {
      const maxPrivacy: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: true,
          sourceTransactionsHidden: true,
        },
      };

      const standardDisclosure: ExportableCredential = {
        id: "cred-456",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: false,
        },
      };

      const maxPrivacyPolicy = analyzeDisclosurePolicy(maxPrivacy);
      expect(getPolicyLabel(maxPrivacyPolicy)).toBe("Maximum Privacy");

      const standardPolicy = analyzeDisclosurePolicy(standardDisclosure);
      expect(getPolicyLabel(standardPolicy)).toBe("Standard Disclosure");
    });
  });

  describe("edge cases", () => {
    it("handles credential with null optional fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: undefined,
        subject: undefined,
        proof: undefined,
      };

      const inspection = inspectCredentialSchema(credential);
      expect(inspection.isValid).toBe(true);

      const metadata = extractInspectorMetadata(credential);
      expect(metadata.issuer).toBeUndefined();
    });

    it("handles proof with null revoked date", () => {
      const proof: ExportableProof = {
        id: "proof-456",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
        revokedAt: null,
      };

      const inspection = inspectProofSchema(proof);
      expect(inspection.isValid).toBe(true);

      const policy = analyzeCredentialPolicy(undefined, proof);
      expect(policy.warnings.some((w) => w.message.includes("revoked"))).toBe(false);
    });

    it("handles very long identifier strings", () => {
      const longId = "x".repeat(10000);
      const credential: ExportableCredential = {
        id: longId,
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const inspection = inspectCredentialSchema(credential);
      expect(inspection.knownFields.id).toBe(longId);

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);
      expect(exported.credential.id).toBe(longId);
    });
  });
});
