/**
 * Tests for credential policy validator.
 *
 * Coverage:
 * - Disclosure policy analysis (hidden vs revealed)
 * - Policy explanations and human-readable messages
 * - Signing key ID extraction
 * - Network explanation
 * - Schema version explanation
 * - Warning detection and severity
 */

import {
  analyzeDisclosurePolicy,
  analyzeCredentialPolicy,
  extractSigningKeyId,
  extractProofType,
  explainSchemaVersion,
  explainNetwork,
  formatKeyIdForDisplay,
  getPolicyLabel,
  getWarningsSeverity,
  type DisclosurePolicy,
  type CredentialPolicy,
  type PolicyWarning,
} from "../policy-validator";
import type { ExportableCredential, ExportableProof } from "../export";

describe("policy-validator", () => {
  describe("analyzeDisclosurePolicy", () => {
    describe("maximum privacy (both hidden)", () => {
      it("analyzes credential with both amount and sources hidden", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          privacy: {
            exactIncomeHidden: true,
            sourceTransactionsHidden: true,
          },
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(false);
        expect(policy.sourceDisclosed).toBe(false);
        expect(policy.amountExplanation).toContain("hidden");
        expect(policy.sourceExplanation).toContain("hidden");
        expect(policy.summary).toContain("Maximum privacy");
      });
    });

    describe("standard disclosure (both revealed)", () => {
      it("analyzes credential with both amount and sources disclosed", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          privacy: {
            exactIncomeHidden: false,
            sourceTransactionsHidden: false,
          },
          claim: {
            amount: "5000",
            sender: "sender-address",
          },
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(true);
        expect(policy.sourceDisclosed).toBe(true);
        expect(policy.amountExplanation).toContain("disclosed");
        expect(policy.sourceExplanation).toContain("disclosed");
        expect(policy.summary).toContain("Standard disclosure");
      });
    });

    describe("partial disclosure (amount only)", () => {
      it("analyzes credential with amount disclosed but sources hidden", () => {
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
          },
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(true);
        expect(policy.sourceDisclosed).toBe(false);
        expect(policy.summary).toContain("Partial disclosure");
        expect(policy.summary).toContain("amount");
      });
    });

    describe("partial disclosure (sources only)", () => {
      it("analyzes credential with sources disclosed but amount hidden", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          privacy: {
            exactIncomeHidden: true,
            sourceTransactionsHidden: false,
          },
          claim: {
            sender: "sender-address",
          },
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(false);
        expect(policy.sourceDisclosed).toBe(true);
        expect(policy.summary).toContain("Partial disclosure");
        expect(policy.summary).toContain("sources");
      });
    });

    describe("edge cases", () => {
      it("handles undefined credential", () => {
        const policy = analyzeDisclosurePolicy(undefined);

        expect(policy.amountDisclosed).toBe(false);
        expect(policy.sourceDisclosed).toBe(false);
        expect(policy.summary).toContain("No disclosure policy");
      });

      it("handles missing privacy object", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(false);
        expect(policy.sourceDisclosed).toBe(false);
      });

      it("defaults to hidden when privacy flags are undefined", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          privacy: {},
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.amountDisclosed).toBe(false);
        expect(policy.sourceDisclosed).toBe(false);
      });

      it("considers sourceAddress as source disclosure", () => {
        const credential: ExportableCredential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          privacy: {
            exactIncomeHidden: true,
            sourceTransactionsHidden: true,
          },
          claim: {
            sourceAddress: "source-addr",
          },
        };

        const policy = analyzeDisclosurePolicy(credential);

        expect(policy.sourceDisclosed).toBe(true);
      });
    });
  });

  describe("extractSigningKeyId", () => {
    it("extracts key ID from credential hash", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "abcdef0123456789fedcba9876543210",
        },
      };

      const keyId = extractSigningKeyId(credential);

      // Returns first 16 chars of credentialHash
      expect(keyId).toBe("abcdef0123456789");
      expect(keyId?.length).toBe(16);
    });

    it("handles missing credential", () => {
      const keyId = extractSigningKeyId(undefined);

      expect(keyId).toBeNull();
    });

    it("handles missing proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const keyId = extractSigningKeyId(credential);

      expect(keyId).toBeNull();
    });

    it("handles missing credential hash", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
        },
      };

      const keyId = extractSigningKeyId(credential);

      expect(keyId).toBeNull();
    });

    it("returns stable key ID for same credential", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "abcdef0123456789fedcba9876543210",
        },
      };

      const keyId1 = extractSigningKeyId(credential);
      const keyId2 = extractSigningKeyId(credential);

      expect(keyId1).toBe(keyId2);
    });
  });

  describe("extractProofType", () => {
    it("extracts proof type from credential", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
        },
      };

      const proofType = extractProofType(credential);

      expect(proofType).toBe("Ed25519Signature2020");
    });

    it("handles missing proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const proofType = extractProofType(credential);

      expect(proofType).toBeNull();
    });

    it("handles undefined credential", () => {
      const proofType = extractProofType(undefined);

      expect(proofType).toBeNull();
    });
  });

  describe("explainSchemaVersion", () => {
    it("explains version 1", () => {
      const explanation = explainSchemaVersion("1");

      expect(explanation).toContain("version 1");
      expect(explanation).toContain("current standard");
    });

    it("explains version 1.0", () => {
      const explanation = explainSchemaVersion("1.0");

      expect(explanation).toContain("version 1");
      expect(explanation).toContain("current standard");
    });

    it("explains version 1.0.0", () => {
      const explanation = explainSchemaVersion("1.0.0");

      expect(explanation).toContain("version 1");
      expect(explanation).toContain("current standard");
    });

    it("warns about unknown version", () => {
      const explanation = explainSchemaVersion("2.0");

      expect(explanation).toContain("2.0");
      expect(explanation).toContain("not a recognized");
    });

    it("handles null version", () => {
      const explanation = explainSchemaVersion(null);

      expect(explanation).toContain("not specified");
    });

    it("handles undefined version", () => {
      const explanation = explainSchemaVersion(undefined);

      expect(explanation).toContain("not specified");
    });
  });

  describe("explainNetwork", () => {
    it("explains Stellar mainnet", () => {
      const explanation = explainNetwork("stellar");

      expect(explanation).toContain("mainnet");
      expect(explanation).toContain("production");
    });

    it("explains Stellar mainnet (explicit)", () => {
      const explanation = explainNetwork("stellar-mainnet");

      expect(explanation).toContain("mainnet");
      expect(explanation).toContain("production");
    });

    it("explains Stellar testnet", () => {
      const explanation = explainNetwork("stellar-testnet");

      expect(explanation).toContain("testnet");
      expect(explanation).toContain("test");
    });

    it("explains Stellar public", () => {
      const explanation = explainNetwork("stellar-public");

      expect(explanation).toContain("public");
    });

    it("handles unknown network", () => {
      const explanation = explainNetwork("custom-network");

      expect(explanation).toContain("custom-network");
    });

    it("handles null network", () => {
      const explanation = explainNetwork(null);

      expect(explanation).toContain("not specified");
    });

    it("handles case-insensitive networks", () => {
      const explanation = explainNetwork("STELLAR-TESTNET");

      expect(explanation).toContain("testnet");
    });
  });

  describe("analyzeCredentialPolicy", () => {
    it("analyzes complete credential with proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: false,
        },
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "abcdef0123456789fedcba9876543210",
        },
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "RecurringIncomeProof",
        schemaVersion: "1",
        network: "stellar",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
      };

      const policy = analyzeCredentialPolicy(credential, proof);

      expect(policy.schemaVersion).toBe("1");
      expect(policy.proofType).toBe("Ed25519Signature2020");
      expect(policy.network).toBe("stellar");
      expect(policy.signingKeyId).toBe("abcdef0123456789"); // First 16 chars
      expect(policy.disclosurePolicy.amountDisclosed).toBe(true);
      expect(policy.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it("detects missing schema version", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
      };

      const policy = analyzeCredentialPolicy(credential, undefined);

      expect(policy.warnings.some((w) => w.message.includes("Schema version"))).toBe(true);
    });

    it("detects missing proof type", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const policy = analyzeCredentialPolicy(credential, undefined);

      expect(policy.warnings.some((w) => w.message.includes("Proof type"))).toBe(true);
    });

    it("detects revoked credential", () => {
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
        revokedAt: "2024-01-15T12:00:00Z",
      };

      const policy = analyzeCredentialPolicy(credential, proof);

      expect(policy.warnings.some((w) => w.level === "warning" && w.message.includes("revoked"))).toBe(true);
    });

    it("detects expired credential", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        expiresAt: "2020-01-01T12:00:00Z", // Past date
      };

      const policy = analyzeCredentialPolicy(credential, undefined);

      expect(policy.warnings.some((w) => w.level === "warning" && w.message.includes("expired"))).toBe(true);
    });

    it("detects expiring soon credential", () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 3); // 3 days from now
      const expiresAt = soon.toISOString();

      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        expiresAt,
      };

      const policy = analyzeCredentialPolicy(credential, undefined);

      expect(policy.warnings.some((w) => w.level === "caution" && w.message.includes("expires"))).toBe(true);
    });

    it("handles undefined credential", () => {
      const policy = analyzeCredentialPolicy(undefined, undefined);

      expect(policy.schemaVersion).toBeNull();
      expect(policy.disclosurePolicy).toBeDefined();
    });
  });

  describe("formatKeyIdForDisplay", () => {
    it("returns full key ID if shorter than max length", () => {
      const formatted = formatKeyIdForDisplay("abcdef");

      expect(formatted).toBe("abcdef");
    });

    it("truncates key ID to max length with ellipsis", () => {
      const formatted = formatKeyIdForDisplay("abcdefghijklmnopqrst", 12);

      expect(formatted).toBe("abcdefghijkl…");
      expect(formatted.length).toBe(13); // 12 chars + ellipsis
    });

    it("uses default max length of 12", () => {
      const formatted = formatKeyIdForDisplay("abcdefghijklmnopqrst");

      expect(formatted).toBe("abcdefghijkl…");
    });

    it("handles null key ID", () => {
      const formatted = formatKeyIdForDisplay(null);

      expect(formatted).toBe("Unknown");
    });

    it("handles undefined key ID", () => {
      const formatted = formatKeyIdForDisplay(undefined);

      expect(formatted).toBe("Unknown");
    });

    it("handles empty string", () => {
      const formatted = formatKeyIdForDisplay("");

      // Empty string is falsy so returns "Unknown"
      expect(formatted).toBe("Unknown");
    });
  });

  describe("getPolicyLabel", () => {
    it("labels maximum privacy policy", () => {
      const policy: DisclosurePolicy = {
        amountDisclosed: false,
        amountExplanation: "",
        sourceDisclosed: false,
        sourceExplanation: "",
        summary: "",
      };

      const label = getPolicyLabel(policy);

      expect(label).toBe("Maximum Privacy");
    });

    it("labels standard disclosure policy", () => {
      const policy: DisclosurePolicy = {
        amountDisclosed: true,
        amountExplanation: "",
        sourceDisclosed: true,
        sourceExplanation: "",
        summary: "",
      };

      const label = getPolicyLabel(policy);

      expect(label).toBe("Standard Disclosure");
    });

    it("labels amount disclosed policy", () => {
      const policy: DisclosurePolicy = {
        amountDisclosed: true,
        amountExplanation: "",
        sourceDisclosed: false,
        sourceExplanation: "",
        summary: "",
      };

      const label = getPolicyLabel(policy);

      expect(label).toBe("Amount Disclosed");
    });

    it("labels sources disclosed policy", () => {
      const policy: DisclosurePolicy = {
        amountDisclosed: false,
        amountExplanation: "",
        sourceDisclosed: true,
        sourceExplanation: "",
        summary: "",
      };

      const label = getPolicyLabel(policy);

      expect(label).toBe("Sources Disclosed");
    });
  });

  describe("getWarningsSeverity", () => {
    it("returns error severity for warning level", () => {
      const warnings: PolicyWarning[] = [
        { level: "warning", message: "Test warning" },
      ];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("warning");
    });

    it("returns caution severity for caution level", () => {
      const warnings: PolicyWarning[] = [
        { level: "caution", message: "Test caution" },
      ];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("caution");
    });

    it("returns info severity for info level", () => {
      const warnings: PolicyWarning[] = [
        { level: "info", message: "Test info" },
      ];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("info");
    });

    it("prioritizes warning over caution and info", () => {
      const warnings: PolicyWarning[] = [
        { level: "info", message: "Info" },
        { level: "warning", message: "Warning" },
        { level: "caution", message: "Caution" },
      ];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("warning");
    });

    it("prioritizes caution over info", () => {
      const warnings: PolicyWarning[] = [
        { level: "info", message: "Info" },
        { level: "caution", message: "Caution" },
      ];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("caution");
    });

    it("returns info for empty warnings", () => {
      const warnings: PolicyWarning[] = [];

      const severity = getWarningsSeverity(warnings);

      expect(severity).toBe("info");
    });
  });
});
