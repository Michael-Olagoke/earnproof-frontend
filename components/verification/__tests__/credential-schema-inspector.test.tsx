/**
 * Tests for CredentialSchemaInspector component.
 *
 * Coverage:
 * - Rendering with valid credentials and proof
 * - Handling missing/partial data
 * - Displaying metadata sections
 * - Warning detection and display
 * - Unknown fields warning
 * - Privacy notice
 * - Collapsible sections behavior
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialSchemaInspector } from "../credential-schema-inspector";
import type { ExportableCredential, ExportableProof } from "@/lib/credentials/export";

// Mock dependencies
jest.mock("@/lib/credentials/schema-inspector");
jest.mock("@/lib/credentials/policy-validator");
jest.mock("@/components/common/timestamp", () => ({
  Timestamp: ({ value }: { value: string }) => <span>{new Date(value).toLocaleString()}</span>,
}));

// Import mocked modules after mocking
import * as schemaInspectorModule from "@/lib/credentials/schema-inspector";
import * as policyValidatorModule from "@/lib/credentials/policy-validator";

describe("CredentialSchemaInspector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering with valid data", () => {
    it("renders the inspector container when credential is provided", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("Schema Inspector")).toBeInTheDocument();
    });

    it("does not render when credential is undefined", () => {
      const { container } = render(<CredentialSchemaInspector credential={undefined} proof={undefined} />);

      expect(container.firstChild).toBeNull();
    });

    it("displays credential metadata fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1.0.0",
        issuer: "issuer-456",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("cred-123")).toBeInTheDocument();
      expect(screen.getByText("RecurringIncomeCredential")).toBeInTheDocument();
      expect(screen.getByText("1.0.0")).toBeInTheDocument();
      expect(screen.getByText("issuer-456")).toBeInTheDocument();
    });

    it("displays proof and network metadata", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        subject: { walletHash: "wallet-hash-abc" },
      };

      const proof: ExportableProof = {
        id: "proof-456",
        type: "RecurringIncomeProof",
        schemaVersion: "1",
        network: "stellar",
      };

      render(<CredentialSchemaInspector credential={credential} proof={proof} />);

      expect(screen.getByText("proof-456")).toBeInTheDocument();
      expect(screen.getByText("RecurringIncomeProof")).toBeInTheDocument();
      expect(screen.getByText("stellar")).toBeInTheDocument();
      expect(screen.getByText("wallet-hash-abc")).toBeInTheDocument();
    });

    it("displays timestamps when present", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuedAt: "2024-01-01T12:00:00Z",
        expiresAt: "2025-01-01T12:00:00Z",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/Issued At/)).toBeInTheDocument();
      expect(screen.getByText(/Expires At/)).toBeInTheDocument();
    });

    it("displays cryptographic information when available", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "abcdef0123456789fedcba9876543210abcdef0123456789",
        },
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("Ed25519Signature2020")).toBeInTheDocument();
      // Hash should be truncated for display
      expect(screen.getByText(/abcdef0123456789fedcba9876543210a.../)).toBeInTheDocument();
    });

    it("displays privacy and disclosure information", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        privacy: {
          exactIncomeHidden: true,
          sourceTransactionsHidden: false,
        },
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/Disclosure Policy/)).toBeInTheDocument();
      expect(screen.getByText(/Amount Hidden/)).toBeInTheDocument();
      expect(screen.getByText(/Sources Hidden/)).toBeInTheDocument();
    });
  });

  describe("sections and collapsibility", () => {
    it("displays collapsible section headers", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/Credential Metadata/)).toBeInTheDocument();
    });

    it("displays section counts", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        issuer: "issuer-456",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      // Credential Metadata section should show count
      expect(screen.getByText(/Credential Metadata \(\d+\)/)).toBeInTheDocument();
    });

    it("allows collapsing and expanding sections", async () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash123",
        },
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);
      const user = userEvent.setup();

      // Find the Cryptographic Information section header
      const cryptoHeader = screen.getByText(/Cryptographic Information/);

      // Click to expand
      await user.click(cryptoHeader);

      // Content should now be visible
      expect(screen.getByText("Ed25519Signature2020")).toBeInTheDocument();
    });
  });

  describe("policy warnings", () => {
    it("displays policy warnings when present", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      // Mock analyzeCredentialPolicy to return warnings
      const mockAnalyzePolicy = policyValidatorModule.analyzeCredentialPolicy as jest.Mock;
      mockAnalyzePolicy.mockReturnValue({
        schemaVersion: "1",
        schemaExplanation: "Standard schema",
        proofType: "Ed25519",
        network: "stellar",
        networkExplanation: "Stellar mainnet",
        signingKeyId: "key-123",
        disclosurePolicy: {
          amountDisclosed: false,
          amountExplanation: "Hidden",
          sourceDisclosed: false,
          sourceExplanation: "Hidden",
          summary: "Maximum privacy",
        },
        warnings: [
          { level: "info", message: "Test info warning" },
          { level: "caution", message: "Test caution warning" },
        ],
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("Test info warning")).toBeInTheDocument();
      expect(screen.getByText("Test caution warning")).toBeInTheDocument();
    });

    it("displays warning severity in badge", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const mockAnalyzePolicy = policyValidatorModule.analyzeCredentialPolicy as jest.Mock;
      mockAnalyzePolicy.mockReturnValue({
        schemaVersion: "1",
        schemaExplanation: "Test",
        proofType: null,
        network: null,
        networkExplanation: "Test",
        signingKeyId: null,
        disclosurePolicy: {
          amountDisclosed: false,
          amountExplanation: "",
          sourceDisclosed: false,
          sourceExplanation: "",
          summary: "Test summary",
        },
        warnings: [{ level: "warning", message: "Warning" }],
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      // Badge should show warning severity
      expect(screen.getByText(/⚠/)).toBeInTheDocument();
    });
  });

  describe("unknown fields", () => {
    it("displays warning for unknown fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const mockInspect = schemaInspectorModule.inspectCredentialSchema as jest.Mock;
      mockInspect.mockReturnValue({
        isValid: true,
        hasErrors: false,
        errors: [],
        schemaVersion: "1",
        isKnownVersion: true,
        credentialType: "RecurringIncomeCredential",
        knownFields: {},
        unknownFields: ["customField1", "customField2"],
        hasPrivateData: false,
        privacyFlags: { exactIncomeHidden: false, sourceTransactionsHidden: false },
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/Unknown fields/)).toBeInTheDocument();
      expect(screen.getByText(/customField1/)).toBeInTheDocument();
      expect(screen.getByText(/customField2/)).toBeInTheDocument();
    });

    it("does not display unknown fields warning when there are none", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const mockInspect = schemaInspectorModule.inspectCredentialSchema as jest.Mock;
      mockInspect.mockReturnValue({
        isValid: true,
        hasErrors: false,
        errors: [],
        schemaVersion: "1",
        isKnownVersion: true,
        credentialType: "RecurringIncomeCredential",
        knownFields: {},
        unknownFields: [],
        hasPrivateData: false,
        privacyFlags: { exactIncomeHidden: false, sourceTransactionsHidden: false },
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.queryByText(/Unknown fields/)).not.toBeInTheDocument();
    });
  });

  describe("privacy notice", () => {
    it("displays privacy notice at the bottom", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/allowlisted metadata/)).toBeInTheDocument();
      expect(screen.getByText(/Private claims/)).toBeInTheDocument();
      expect(screen.getByText(/signatures/)).toBeInTheDocument();
    });
  });

  describe("partial data", () => {
    it("handles credential without proof", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("Schema Inspector")).toBeInTheDocument();
      expect(screen.getByText("cred-123")).toBeInTheDocument();
    });

    it("handles credential with only some fields", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        schemaVersion: "1",
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText("cred-123")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("handles proof with revocation timestamp", () => {
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

      render(<CredentialSchemaInspector credential={credential} proof={proof} />);

      expect(screen.getByText(/Revoked At/)).toBeInTheDocument();
    });
  });

  describe("schema validation", () => {
    it("displays schema validation errors when present", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
      };

      const mockInspect = schemaInspectorModule.inspectCredentialSchema as jest.Mock;
      mockInspect.mockReturnValue({
        isValid: false,
        hasErrors: true,
        errors: ["Missing or invalid schemaVersion", "Invalid proof structure"],
        schemaVersion: null,
        isKnownVersion: false,
        credentialType: "RecurringIncomeCredential",
        knownFields: {},
        unknownFields: [],
        hasPrivateData: false,
        privacyFlags: { exactIncomeHidden: null, sourceTransactionsHidden: null },
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.getByText(/Schema Validation Issues/)).toBeInTheDocument();
      expect(screen.getByText(/Missing or invalid schemaVersion/)).toBeInTheDocument();
      expect(screen.getByText(/Invalid proof structure/)).toBeInTheDocument();
    });

    it("does not display validation errors section when there are none", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
      };

      const mockInspect = schemaInspectorModule.inspectCredentialSchema as jest.Mock;
      mockInspect.mockReturnValue({
        isValid: true,
        hasErrors: false,
        errors: [],
        schemaVersion: "1",
        isKnownVersion: true,
        credentialType: "RecurringIncomeCredential",
        knownFields: {},
        unknownFields: [],
        hasPrivateData: false,
        privacyFlags: { exactIncomeHidden: false, sourceTransactionsHidden: false },
      });

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      expect(screen.queryByText(/Schema Validation Issues/)).not.toBeInTheDocument();
    });
  });

  describe("never exposes private data", () => {
    it("does not render claim data in any section", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        claim: {
          operator: "gte",
          thresholdAmount: "5000",
          assetCode: "USDC",
        },
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      // Claim fields should NOT be displayed
      expect(screen.queryByText("5000")).not.toBeInTheDocument();
      expect(screen.queryByText("USDC")).not.toBeInTheDocument();
    });

    it("does not render signature data", () => {
      const credential: ExportableCredential = {
        id: "cred-123",
        type: "RecurringIncomeCredential",
        schemaVersion: "1",
        proof: {
          type: "Ed25519Signature2020",
          credentialHash: "hash123",
          signature: "should-not-appear-anywhere",
        },
      };

      render(<CredentialSchemaInspector credential={credential} proof={undefined} />);

      // Signature should NOT be displayed
      expect(screen.queryByText("should-not-appear-anywhere")).not.toBeInTheDocument();
    });
  });
});
