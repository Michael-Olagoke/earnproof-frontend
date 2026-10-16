/**
 * Tests for credential schema inspector utilities.
 *
 * Coverage:
 * - Legacy, current, and unknown schema versions
 * - Known vs unknown fields detection
 * - Private data detection and non-exposure
 * - Malformed credential handling with bounded errors
 * - Edge cases (null, undefined, wrong types)
 */

import {
  inspectCredentialSchema,
  inspectProofSchema,
  extractInspectorMetadata,
  extractProofInspectorMetadata,
  hasPrivateData,
  isKnownSchemaVersion,
  KNOWN_SCHEMA_VERSIONS,
} from "../schema-inspector";
import type { ExportableCredential, ExportableProof } from "../export";

describe("schema-inspector", () => {
  describe("isKnownSchemaVersion", () => {
    it("accepts known schema versions", () => {
      expect(isKnownSchemaVersion("1")).toBe(true);
      expect(isKnownSchemaVersion("1.0")).toBe(true);
      expect(isKnownSchemaVersion("1.0.0")).toBe(true);
    });

    it("rejects unknown schema versions", () => {
      expect(isKnownSchemaVersion("2")).toBe(false);
      expect(isKnownSchemaVersion("1.1")).toBe(false);
      expect(isKnownSchemaVersion("legacy")).toBe(false);
      expect(isKnownSchemaVersion(null)).toBe(false);
      expect(isKnownSchemaVersion(undefined)).toBe(false);
      expect(isKnownSchemaVersion(1)).toBe(false);
    });
  });

  describe("inspectCredentialSchema", () => {
    describe("valid current schema", () => {
      it("identifies valid v1 credential with all known fields", () => {
        const credential = {
          id: "cred-123",
          type: "RecurringIncomeCredential",
          schemaVersion: "1",
          issuer: "issuer-456",
          subject: { walletHash: "hash-abc" },
          claim: {
            operator: "gte",
            thresholdAmount: "1000",
            assetCode: "USDC",
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
            credentialHash: "hash-def",
            signature: "sig-xyz",
          },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.isValid).toBe(true);
        expect(result.hasErrors).toBe(false);
        expect(result.errors).toEqual([]);
        expect(result.schemaVersion).toBe("1");
        expect(result.isKnownVersion).toBe(true);
        expect(result.credentialType).toBe("RecurringIncomeCredential");
        expect(result.hasPrivateData).toBe(true); // Has claim and signature
        expect(result.unknownFields).toEqual([]);

        // Check known fields are extracted
        expect(result.knownFields.id).toBe("cred-123");
        expect(result.knownFields.type).toBe("RecurringIncomeCredential");
        expect(result.knownFields.issuer).toBe("issuer-456");
        expect(result.knownFields["subject.walletHash"]).toBe("hash-abc");
        expect(result.knownFields["proof.type"]).toBe("Ed25519Signature2020");
        expect(result.knownFields["proof.credentialHash"]).toBe("hash-def");
        expect(result.knownFields["privacy.exactIncomeHidden"]).toBe(false);

        // Check signature is NOT included in known fields
        expect(result.knownFields["proof.signature"]).toBeUndefined();
        expect(result.knownFields.claim).toBeUndefined();
      });

      it("extracts privacy flags correctly", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          privacy: {
            exactIncomeHidden: true,
            sourceTransactionsHidden: true,
          },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.privacyFlags.exactIncomeHidden).toBe(true);
        expect(result.privacyFlags.sourceTransactionsHidden).toBe(true);
      });
    });

    describe("unknown schema versions", () => {
      it("detects unknown schema version but extracts known fields", () => {
        const credential = {
          id: "cred-123",
          schemaVersion: "2.0",
          type: "NewCredentialType",
          issuer: "issuer-456",
          issuedAt: "2024-01-01T12:00:00Z",
          expiresAt: "2025-01-01T12:00:00Z",
          unknownField: "should be flagged",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.schemaVersion).toBe("2.0");
        expect(result.isKnownVersion).toBe(false);
        expect(result.isValid).toBe(false);
        expect(result.knownFields.id).toBe("cred-123");
        expect(result.knownFields.type).toBe("NewCredentialType");
        expect(result.unknownFields).toContain("unknownField");
      });
    });

    describe("malformed credentials", () => {
      it("handles null credential", () => {
        const result = inspectCredentialSchema(null);

        expect(result.isValid).toBe(false);
        expect(result.hasErrors).toBe(true);
        expect(result.errors).toContain("Credential must be an object");
      });

      it("handles undefined credential", () => {
        const result = inspectCredentialSchema(undefined);

        expect(result.isValid).toBe(false);
        expect(result.hasErrors).toBe(true);
      });

      it("handles non-object credential", () => {
        expect(inspectCredentialSchema("not an object").hasErrors).toBe(true);
        expect(inspectCredentialSchema(123).hasErrors).toBe(true);
        expect(inspectCredentialSchema(true).hasErrors).toBe(true);
        expect(inspectCredentialSchema([]).hasErrors).toBe(true);
      });

      it("handles missing required fields", () => {
        const credential = { id: "cred-123" };

        const result = inspectCredentialSchema(credential);

        expect(result.hasErrors).toBe(true);
        expect(result.errors).toContain("Missing or invalid schemaVersion");
        expect(result.errors).toContain("Missing or invalid type");
      });

      it("bounds error count to prevent flooding", () => {
        const credential: Record<string, unknown> = {
          field1: { invalid: "nested" },
          field2: undefined,
          field3: 123,
          field4: Symbol("test"),
          field5: [],
          field6: {},
          field7: true,
          field8: null,
          field9: "string",
          field10: () => {},
          field11: new Date(),
          extraField: "should truncate errors",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.errors.length).toBeLessThanOrEqual(11); // Max errors + truncation message
      });

      it("handles malformed subject", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          subject: "not an object",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.knownFields["subject.walletHash"]).toBeUndefined();
      });

      it("handles malformed proof", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          proof: "not an object",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.knownFields["proof.type"]).toBeUndefined();
        expect(result.knownFields["proof.credentialHash"]).toBeUndefined();
      });
    });

    describe("private data detection", () => {
      it("detects claim data as private", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          claim: { operator: "gte", thresholdAmount: "1000" },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.hasPrivateData).toBe(true);
      });

      it("detects signature as private", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          proof: { signature: "sig-xyz" },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.hasPrivateData).toBe(true);
      });

      it("does not detect credentialHash as private", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          proof: { credentialHash: "hash-def" },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.hasPrivateData).toBe(false);
      });

      it("does not flag absence of private data", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          id: "cred-123",
          issuer: "issuer-456",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.hasPrivateData).toBe(false);
      });
    });

    describe("unknown fields", () => {
      it("collects unknown top-level fields", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          id: "cred-123",
          unknownField1: "value",
          unknownField2: 123,
          unknownField3: { nested: "object" },
        };

        const result = inspectCredentialSchema(credential);

        expect(result.unknownFields).toContain("unknownField1");
        expect(result.unknownFields).toContain("unknownField2");
        expect(result.unknownFields).toContain("unknownField3");
      });

      it("does not flag standard fields as unknown", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          id: "cred-123",
          issuer: "issuer-456",
          subject: { walletHash: "hash-abc" },
          claim: {},
          privacy: {},
          proof: {},
          issuedAt: "2024-01-01T12:00:00Z",
          expiresAt: "2025-01-01T12:00:00Z",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.unknownFields).toEqual([]);
      });

      it("sorts unknown fields alphabetically", () => {
        const credential = {
          schemaVersion: "1",
          type: "RecurringIncomeCredential",
          zebra: "z",
          apple: "a",
          middle: "m",
        };

        const result = inspectCredentialSchema(credential);

        expect(result.unknownFields).toEqual(["apple", "middle", "zebra"]);
      });
    });
  });

  describe("inspectProofSchema", () => {
    it("validates proof with all known fields", () => {
      const proof = {
        id: "proof-123",
        type: "RecurringIncomeProof",
        schemaVersion: "1",
        network: "stellar",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        revokedAt: null,
      };

      const result = inspectProofSchema(proof);

      expect(result.isValid).toBe(true);
      expect(result.hasErrors).toBe(false);
      expect(result.schemaVersion).toBe("1");
      expect(result.isKnownVersion).toBe(true);
      expect(result.credentialType).toBe("RecurringIncomeProof");
      expect(result.knownFields.network).toBe("stellar");
      // id and revokedAt are not in INSPECTOR_PROOF_METADATA_FIELDS so they're unknown
      expect(result.unknownFields.sort()).toEqual(["id", "revokedAt"]);
    });

    it("handles malformed proof", () => {
      const result = inspectProofSchema(null);

      expect(result.isValid).toBe(false);
      expect(result.hasErrors).toBe(true);
    });

    it("detects unknown fields in proof", () => {
      const proof = {
        schemaVersion: "1",
        type: "ProofType",
        unknownProofField: "value",
      };

      const result = inspectProofSchema(proof);

      expect(result.unknownFields).toContain("unknownProofField");
    });

    it("never detects private data in proof", () => {
      const proof = {
        schemaVersion: "1",
        type: "ProofType",
        id: "proof-123",
      };

      const result = inspectProofSchema(proof);

      expect(result.hasPrivateData).toBe(false);
    });
  });

  describe("extractInspectorMetadata", () => {
    it("extracts allowlisted fields from credential", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
        subject: { walletHash: "hash-abc" },
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        privacy: {
          exactIncomeHidden: false,
          sourceTransactionsHidden: true,
        },
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash-def",
          signature: "sig-xyz",
        },
      };

      const metadata = extractInspectorMetadata(credential);

      expect(metadata.id).toBe("cred-123");
      expect(metadata.type).toBe("RecurringIncomeCredential");
      expect(metadata["subject.walletHash"]).toBe("hash-abc");
      expect(metadata["proof.credentialHash"]).toBe("hash-def");
      expect(metadata["privacy.exactIncomeHidden"]).toBe(false);

      // Signature should not be included
      expect(metadata["proof.signature"]).toBeUndefined();
    });

    it("handles undefined credential", () => {
      const metadata = extractInspectorMetadata(undefined);

      expect(metadata).toEqual({});
    });

    it("extracts only present fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const metadata = extractInspectorMetadata(credential);

      expect(Object.keys(metadata)).toEqual(["id", "type", "schemaVersion"]);
    });

    it("excludes undefined fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuedAt: undefined,
      };

      const metadata = extractInspectorMetadata(credential);

      expect(metadata.issuedAt).toBeUndefined();
    });
  });

  describe("extractProofInspectorMetadata", () => {
    it("extracts allowlisted fields from proof", () => {
      const proof: ExportableProof = {
        id: "proof-123",
        type: "RecurringIncomeProof",
        schemaVersion: "1",
        network: "stellar",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
        revokedAt: null,
      };

      const metadata = extractProofInspectorMetadata(proof);

      expect(metadata.type).toBe("RecurringIncomeProof");
      expect(metadata.schemaVersion).toBe("1");
      expect(metadata.network).toBe("stellar");
      expect(metadata.issuedAt).toBe("2024-01-01T12:00:00Z");
      expect(metadata.expiresAt).toBe("2025-01-01T12:00:00Z");
      // revokedAt is not extracted  
      expect(metadata.revokedAt).toBeUndefined();
    });

    it("handles undefined proof", () => {
      const metadata = extractProofInspectorMetadata(undefined);

      expect(metadata).toEqual({});
    });

    it("handles null values in proof", () => {
      const proof: ExportableProof = {
        id: "proof-123",
        type: "ProofType",
        schemaVersion: "1",
        network: "stellar",
        revokedAt: null,
      };

      const metadata = extractProofInspectorMetadata(proof);

      // revokedAt is not extracted (not in allowlist)
      expect(metadata.revokedAt).toBeUndefined();
    });
  });

  describe("hasPrivateData", () => {
    it("detects claim as private data", () => {
      expect(hasPrivateData({ claim: { operator: "gte" } })).toBe(true);
    });

    it("detects signature as private data", () => {
      expect(hasPrivateData({ proof: { signature: "sig-xyz" } })).toBe(true);
    });

    it("allows credentialHash without flagging", () => {
      expect(hasPrivateData({ proof: { credentialHash: "hash-def" } })).toBe(false);
    });

    it("allows metadata-only objects", () => {
      expect(hasPrivateData({ id: "cred-123", issuer: "issuer-456" })).toBe(false);
    });

    it("handles null and undefined", () => {
      expect(hasPrivateData(null)).toBe(false);
      expect(hasPrivateData(undefined)).toBe(false);
    });

    it("handles non-objects", () => {
      expect(hasPrivateData("string")).toBe(false);
      expect(hasPrivateData(123)).toBe(false);
      expect(hasPrivateData(true)).toBe(false);
    });

    it("detects empty claim as private", () => {
      expect(hasPrivateData({ claim: {} })).toBe(true);
    });

    it("detects undefined claim as not private", () => {
      expect(hasPrivateData({ claim: undefined })).toBe(false);
    });
  });

  describe("edge cases and regression tests", () => {
    it("handles deeply nested unknown objects", () => {
      const credential = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
        unknownNested: {
          deep: {
            structure: {
              value: "should not crash",
            },
          },
        },
      };

      const result = inspectCredentialSchema(credential);

      expect(result.unknownFields).toContain("unknownNested");
      expect(result.hasErrors).toBe(false);
    });

    it("handles fields with non-string keys", () => {
      const credential: Record<string | symbol, unknown> = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
        [Symbol("test")]: "should not crash",
      };

      const result = inspectCredentialSchema(credential);

      expect(result.isValid).toBe(true);
    });

    it("handles circular references gracefully", () => {
      const credential: Record<string, unknown> = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
      };
      credential.self = credential; // Create circular reference

      // Should not crash during inspection
      expect(() => inspectCredentialSchema(credential)).not.toThrow();
    });

    it("handles very long field values", () => {
      const longValue = "x".repeat(10000);
      const credential = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
        id: longValue,
      };

      const result = inspectCredentialSchema(credential);

      expect(result.knownFields.id).toBe(longValue);
      expect(result.isValid).toBe(true);
    });

    it("handles mixed valid and invalid field types", () => {
      const credential = {
        schemaVersion: "1",
        type: "RecurringIncomeCredential",
        id: "cred-123",
        invalidProof: { type: 123, credentialHash: null },
      };

      const result = inspectCredentialSchema(credential);

      expect(result.unknownFields).toContain("invalidProof");
      expect(result.knownFields.id).toBe("cred-123");
    });
  });
});
