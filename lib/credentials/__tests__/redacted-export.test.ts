/**
 * Tests for redacted credential export functionality.
 *
 * Coverage:
 * - Building redacted exports with metadata only
 * - Excluding private claim data
 * - Excluding signatures
 * - Including only allowlisted fields
 * - Proper filename and MIME type
 * - Warnings about redaction
 * - Safe filename validation
 */

import {
  buildRedactedCredentialExport,
  isSafeExportFilename,
  REDACTED_CREDENTIAL_EXPORT_FILENAME,
  REDACTED_CREDENTIAL_FIELDS,
  REDACTED_PROOF_FIELDS,
} from "../export";
import type { ExportableCredential, ExportableProof } from "../export";

describe("redacted-export", () => {
  describe("buildRedactedCredentialExport", () => {
    it("exports credential with metadata only", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
        subject: { walletHash: "wallet-hash-abc" },
        privacy: {
          exactIncomeHidden: true,
          sourceTransactionsHidden: false,
        },
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash-def",
          signature: "sig-xyz", // Should be excluded
        },
      };

      const plan = buildRedactedCredentialExport({ credential });

      expect(plan.filename).toBe(REDACTED_CREDENTIAL_EXPORT_FILENAME);
      expect(plan.mimeType).toBe("application/json");

      const exported = JSON.parse(plan.body);

      expect(exported.credential.id).toBe("cred-123");
      expect(exported.credential.type).toBe("RecurringIncomeCredential");
      expect(exported.credential.schemaVersion).toBe("1");
      expect(exported.credential.issuer).toBe("issuer-456");
      expect(exported.credential.subject.walletHash).toBe("wallet-hash-abc");
      expect(exported.credential.privacy.exactIncomeHidden).toBe(true);
      expect(exported.credential.privacy.sourceTransactionsHidden).toBe(false);
      expect(exported.credential.issuedAt).toBe("2024-01-01T12:00:00Z");
      expect(exported.credential.expiresAt).toBe("2025-01-01T12:00:00Z");
      expect(exported.credential.proof.type).toBe("Ed25519Signature2020");
      expect(exported.credential.proof.credentialHash).toBe("hash-def");
    });

    it("excludes signature from proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash-def",
          signature: "should-not-appear-in-export",
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.proof.signature).toBeUndefined();
    });

    it("excludes claim data entirely", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          operator: "gte",
          thresholdAmount: "5000",
          assetCode: "USDC",
          periodStart: "2024-01-01T00:00:00Z",
          periodEnd: "2024-02-01T00:00:00Z",
          qualifyingPaymentCount: 10,
          amount: "5000",
          sender: "sender-address",
          sourceAddress: "source-address",
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("includes proof metadata", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
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

      const plan = buildRedactedCredentialExport({ credential, proof });
      const exported = JSON.parse(plan.body);

      expect(exported.proof.id).toBe("proof-456");
      expect(exported.proof.type).toBe("RecurringIncomeProof");
      expect(exported.proof.schemaVersion).toBe("1");
      expect(exported.proof.network).toBe("stellar");
      expect(exported.proof.issuedAt).toBe("2024-01-01T12:00:00Z");
      expect(exported.proof.expiresAt).toBe("2025-01-01T12:00:00Z");
      expect(exported.proof.revokedAt).toBeNull();
    });

    it("lists included fields correctly", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
      };

      const plan = buildRedactedCredentialExport({ credential, proof });

      expect(plan.includedFields).toContain("credential.id");
      expect(plan.includedFields).toContain("credential.type");
      expect(plan.includedFields).toContain("credential.schemaVersion");
      expect(plan.includedFields).toContain("credential.issuer");
      expect(plan.includedFields).toContain("proof.id");
      expect(plan.includedFields).toContain("proof.type");
      expect(plan.includedFields).toContain("proof.network");

      // These should NOT be included in redacted export
      expect(plan.includedFields).not.toContain("credential.claim");
      expect(plan.includedFields).not.toContain("credential.proof.signature");
    });

    it("includes redaction warning", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const plan = buildRedactedCredentialExport({ credential });

      expect(plan.warnings.length).toBeGreaterThan(0);
      expect(plan.warnings[0].field).toBe("amount");
      expect(plan.warnings[0].message).toContain("redacted");
      expect(plan.warnings[0].message).toContain("private claims");
    });

    it("handles credential without proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential).toBeDefined();
      expect(exported.proof).toBeUndefined();
    });

    it("handles proof without credential", () => {
      const proof: ExportableProof = {
        id: "proof-456",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
      };

      const plan = buildRedactedCredentialExport({ proof });
      const exported = JSON.parse(plan.body);

      expect(exported.proof).toBeDefined();
      expect(exported.credential).toBeUndefined();
    });

    it("handles undefined inputs", () => {
      const plan = buildRedactedCredentialExport({});
      const exported = JSON.parse(plan.body);

      expect(exported.credential).toBeUndefined();
      expect(exported.proof).toBeUndefined();
    });

    it("always uses fresh JSON serialization", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const rawJson = JSON.stringify({ credential, proof: null });

      // Even with rawJson provided, redacted export should use fresh serialization
      const plan = buildRedactedCredentialExport({ credential, rawJson });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.id).toBe("cred-123");
      expect(plan.body).toBeDefined();
    });

    it("handles partial privacy flags", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: false,
          // sourceTransactionsHidden omitted
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.privacy.exactIncomeHidden).toBe(false);
      expect(exported.credential.privacy.sourceTransactionsHidden).toBeUndefined();
    });

    it("handles null asset issuer", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          operator: "gte",
          thresholdAmount: "1000",
          assetCode: "USDC",
          assetIssuer: null,
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      // Claim should be excluded
      expect(exported.credential.claim).toBeUndefined();
    });

    it("preserves timestamps", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuedAt: "2024-01-15T10:30:00Z",
        expiresAt: "2024-02-15T10:30:00Z",
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
        revokedAt: "2024-01-20T10:30:00Z",
      };

      const plan = buildRedactedCredentialExport({ credential, proof });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.issuedAt).toBe("2024-01-15T10:30:00Z");
      expect(exported.credential.expiresAt).toBe("2024-02-15T10:30:00Z");
      expect(exported.proof.revokedAt).toBe("2024-01-20T10:30:00Z");
    });
  });

  describe("isSafeExportFilename with redacted export", () => {
    it("accepts redacted credential export filename", () => {
      expect(isSafeExportFilename(REDACTED_CREDENTIAL_EXPORT_FILENAME)).toBe(true);
    });

    it("rejects unsafe redacted filenames", () => {
      expect(isSafeExportFilename("earnproof-credential-redacted-G0000000000000000000000000000000000000000000000000000000.json")).toBe(false);
    });
  });

  describe("constant definitions", () => {
    it("defines correct redacted field lists", () => {
      expect(REDACTED_CREDENTIAL_FIELDS).toContain("id");
      expect(REDACTED_CREDENTIAL_FIELDS).toContain("schemaVersion");
      expect(REDACTED_CREDENTIAL_FIELDS).toContain("privacy.exactIncomeHidden");
      expect(REDACTED_CREDENTIAL_FIELDS).toContain("proof.credentialHash");
      expect(REDACTED_CREDENTIAL_FIELDS).not.toContain("claim.thresholdAmount");
      expect(REDACTED_CREDENTIAL_FIELDS).not.toContain("proof.signature");
    });

    it("defines correct redacted proof field list", () => {
      expect(REDACTED_PROOF_FIELDS).toContain("id");
      expect(REDACTED_PROOF_FIELDS).toContain("type");
      expect(REDACTED_PROOF_FIELDS).toContain("network");
      expect(REDACTED_PROOF_FIELDS).toContain("revokedAt");
    });

    it("redacted export filename is distinct", () => {
      expect(REDACTED_CREDENTIAL_EXPORT_FILENAME).toBe("earnproof-credential-redacted.json");
    });
  });

  describe("redaction guarantees", () => {
    it("never includes claim operator in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: { operator: "gte" },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("never includes threshold amount in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: { thresholdAmount: "5000" },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("never includes asset details in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          assetCode: "USDC",
          assetIssuer: "issuer-address",
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("never includes period in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          periodStart: "2024-01-01T00:00:00Z",
          periodEnd: "2024-02-01T00:00:00Z",
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("never includes qualifying payment count in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: { qualifyingPaymentCount: 10 },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });

    it("never includes sender/source in redacted export", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          sender: "sender-address",
          sourceAddress: "source-address",
        },
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.claim).toBeUndefined();
    });
  });

  describe("JSON validity", () => {
    it("produces valid JSON that can be parsed", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
      };

      const plan = buildRedactedCredentialExport({ credential });

      expect(() => JSON.parse(plan.body)).not.toThrow();
    });

    it("handles special characters in string fields", () => {
      const credential: ExportableCredential = {
        id: 'cred-"123"',
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer\\456",
      };

      const plan = buildRedactedCredentialExport({ credential });
      const exported = JSON.parse(plan.body);

      expect(exported.credential.id).toBe('cred-"123"');
      expect(exported.credential.issuer).toBe("issuer\\456");
    });
  });
});
