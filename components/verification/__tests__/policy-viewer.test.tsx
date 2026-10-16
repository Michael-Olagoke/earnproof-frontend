/**
 * Tests for PolicyViewer component.
 *
 * Coverage:
 * - Rendering disclosure policy information
 * - Displaying schema and network context
 * - Warnings and notices display
 * - Compact mode rendering
 * - Policy fact formatting
 */

import { render, screen } from "@testing-library/react";
import { PolicyViewer } from "../policy-viewer";
import type { CredentialPolicy } from "@/lib/credentials/policy-validator";

describe("PolicyViewer", () => {
  const mockPolicy: CredentialPolicy = {
    schemaVersion: "1",
    schemaExplanation: "This credential uses schema version 1, the current standard.",
    proofType: "Ed25519Signature2020",
    network: "stellar",
    networkExplanation: "This credential is secured on the Stellar mainnet.",
    signingKeyId: "abc123def456",
    disclosurePolicy: {
      amountDisclosed: true,
      amountExplanation: "The exact income amount is disclosed in this credential.",
      sourceDisclosed: false,
      sourceExplanation: "Transaction sources are hidden. Only payment counts are revealed.",
      summary: "Partial disclosure: Income amount is revealed, but not transaction sources.",
    },
    warnings: [],
  };

  describe("full view rendering", () => {
    it("renders policy viewer container", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Disclosure Policy")).toBeInTheDocument();
      expect(screen.getByText("Schema & Network Context")).toBeInTheDocument();
    });

    it("displays disclosure policy section", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("What's Disclosed")).toBeInTheDocument();
      expect(screen.getByText("Income Amount")).toBeInTheDocument();
      expect(screen.getByText("Transaction Sources")).toBeInTheDocument();
    });

    it("shows disclosure status (amount disclosed)", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Disclosed", { selector: ".text-amber-200" })).toBeInTheDocument();
    });

    it("shows disclosure status (source hidden)", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Hidden", { selector: ".text-emerald-200" })).toBeInTheDocument();
    });

    it("displays amount explanation", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("The exact income amount is disclosed in this credential.")).toBeInTheDocument();
    });

    it("displays source explanation", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Transaction sources are hidden. Only payment counts are revealed.")).toBeInTheDocument();
    });

    it("displays policy summary", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Partial disclosure: Income amount is revealed, but not transaction sources.")).toBeInTheDocument();
    });

    it("displays schema and network context section", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Schema Version")).toBeInTheDocument();
      expect(screen.getByText("Network & Signing")).toBeInTheDocument();
    });

    it("displays schema version", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("displays schema explanation", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("This credential uses schema version 1, the current standard.")).toBeInTheDocument();
    });

    it("displays network information", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Network", { selector: ".text-xs" })).toBeInTheDocument();
      expect(screen.getByText("stellar")).toBeInTheDocument();
    });

    it("displays proof type", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Proof Type")).toBeInTheDocument();
      expect(screen.getByText("Ed25519Signature2020")).toBeInTheDocument();
    });

    it("displays signing key reference", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Signing Key")).toBeInTheDocument();
      expect(screen.getByText("abc123def456")).toBeInTheDocument();
    });

    it("displays network explanation", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("This credential is secured on the Stellar mainnet.")).toBeInTheDocument();
    });

    it("displays privacy notice", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText(/This policy viewer explains/)).toBeInTheDocument();
    });
  });

  describe("warning display", () => {
    it("displays warnings when present", () => {
      const policyWithWarnings: CredentialPolicy = {
        ...mockPolicy,
        warnings: [
          { level: "info", message: "Test info message" },
          { level: "caution", message: "Test caution message" },
          { level: "warning", message: "Test warning message" },
        ],
      };

      render(<PolicyViewer policy={policyWithWarnings} />);

      expect(screen.getByText("Notices & Warnings")).toBeInTheDocument();
      expect(screen.getByText("Test info message")).toBeInTheDocument();
      expect(screen.getByText("Test caution message")).toBeInTheDocument();
      expect(screen.getByText("Test warning message")).toBeInTheDocument();
    });

    it("does not display warnings section when there are no warnings", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.queryByText("Notices & Warnings")).not.toBeInTheDocument();
    });

    it("styles info warnings correctly", () => {
      const policyWithWarning: CredentialPolicy = {
        ...mockPolicy,
        warnings: [{ level: "info", message: "Info message" }],
      };

      render(<PolicyViewer policy={policyWithWarning} />);

      const warningElement = screen.getByText("Info message").parentElement;
      expect(warningElement).toHaveClass("border-blue-900/50");
      expect(warningElement).toHaveClass("bg-blue-900/20");
    });

    it("styles caution warnings correctly", () => {
      const policyWithWarning: CredentialPolicy = {
        ...mockPolicy,
        warnings: [{ level: "caution", message: "Caution message" }],
      };

      render(<PolicyViewer policy={policyWithWarning} />);

      const warningElement = screen.getByText("Caution message").parentElement;
      expect(warningElement).toHaveClass("border-amber-900/50");
      expect(warningElement).toHaveClass("bg-amber-900/20");
    });

    it("styles warning level correctly", () => {
      const policyWithWarning: CredentialPolicy = {
        ...mockPolicy,
        warnings: [{ level: "warning", message: "Warning message" }],
      };

      render(<PolicyViewer policy={policyWithWarning} />);

      const warningElement = screen.getByText("Warning message").parentElement;
      expect(warningElement).toHaveClass("border-rose-900/50");
      expect(warningElement).toHaveClass("bg-rose-900/20");
    });
  });

  describe("disclosure policy variations", () => {
    it("displays maximum privacy (both hidden)", () => {
      const privacyPolicy: CredentialPolicy = {
        ...mockPolicy,
        disclosurePolicy: {
          amountDisclosed: false,
          amountExplanation: "The exact income amount is hidden.",
          sourceDisclosed: false,
          sourceExplanation: "Transaction sources are hidden.",
          summary: "Maximum privacy: Only proof type and payment count are revealed.",
        },
      };

      render(<PolicyViewer policy={privacyPolicy} />);

      const disclosureStatus = screen.getAllByText("Hidden", { selector: ".text-emerald-200" });
      expect(disclosureStatus.length).toBeGreaterThanOrEqual(2);
    });

    it("displays standard disclosure (both revealed)", () => {
      const standardPolicy: CredentialPolicy = {
        ...mockPolicy,
        disclosurePolicy: {
          amountDisclosed: true,
          amountExplanation: "The exact income amount is disclosed.",
          sourceDisclosed: true,
          sourceExplanation: "Transaction sources are disclosed.",
          summary: "Standard disclosure: Amount and sources are revealed.",
        },
      };

      render(<PolicyViewer policy={standardPolicy} />);

      const disclosureStatus = screen.getAllByText("Disclosed", { selector: ".text-amber-200" });
      expect(disclosureStatus.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("optional fields", () => {
    it("handles missing network", () => {
      const policyNoNetwork: CredentialPolicy = {
        ...mockPolicy,
        network: null,
      };

      render(<PolicyViewer policy={policyNoNetwork} />);

      expect(screen.queryByText("stellar")).not.toBeInTheDocument();
    });

    it("handles missing proof type", () => {
      const policyNoProof: CredentialPolicy = {
        ...mockPolicy,
        proofType: null,
      };

      render(<PolicyViewer policy={policyNoProof} />);

      expect(screen.queryByText("Ed25519Signature2020")).not.toBeInTheDocument();
    });

    it("handles missing schema version", () => {
      const policyNoSchema: CredentialPolicy = {
        ...mockPolicy,
        schemaVersion: null,
      };

      render(<PolicyViewer policy={policyNoSchema} />);

      expect(screen.getByText("Not specified")).toBeInTheDocument();
    });

    it("handles missing signing key ID", () => {
      const policyNoKeyId: CredentialPolicy = {
        ...mockPolicy,
        signingKeyId: null,
      };

      render(<PolicyViewer policy={policyNoKeyId} />);

      expect(screen.queryByText("abc123def456")).not.toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders compact view when compact prop is true", () => {
      render(<PolicyViewer policy={mockPolicy} compact={true} />);

      expect(screen.getByText("Disclosure:")).toBeInTheDocument();
      expect(screen.getByText("Partial disclosure: Income amount is revealed, but not transaction sources.")).toBeInTheDocument();

      // Should not render full section titles
      expect(screen.queryByText("Disclosure Policy", { selector: "h3" })).not.toBeInTheDocument();
    });

    it("shows summary in compact mode", () => {
      render(<PolicyViewer policy={mockPolicy} compact={true} />);

      expect(screen.getByText("Partial disclosure: Income amount is revealed, but not transaction sources.")).toBeInTheDocument();
    });

    it("shows subset of warnings in compact mode", () => {
      const policyWithManyWarnings: CredentialPolicy = {
        ...mockPolicy,
        warnings: [
          { level: "info", message: "First warning" },
          { level: "caution", message: "Second warning" },
          { level: "warning", message: "Third warning" },
          { level: "info", message: "Fourth warning" },
        ],
      };

      render(<PolicyViewer policy={policyWithManyWarnings} compact={true} />);

      expect(screen.getByText("First warning")).toBeInTheDocument();
      expect(screen.getByText("Second warning")).toBeInTheDocument();
      expect(screen.queryByText("Third warning")).not.toBeInTheDocument();
      expect(screen.getByText("+2 more warnings")).toBeInTheDocument();
    });

    it("does not show privacy notice in compact mode", () => {
      render(<PolicyViewer policy={mockPolicy} compact={true} />);

      expect(screen.queryByText(/This policy viewer explains/)).not.toBeInTheDocument();
    });

    it("compact mode defaults to false", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      expect(screen.getByText("Disclosure Policy")).toBeInTheDocument();
    });
  });

  describe("accessibility and labeling", () => {
    it("uses semantic HTML structure", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      const headings = document.querySelectorAll("h3");
      expect(headings.length).toBeGreaterThan(0);
    });

    it("labels policy facts clearly", () => {
      render(<PolicyViewer policy={mockPolicy} />);

      // All policy facts should have labels
      expect(screen.getByText("Income Amount:")).toBeInTheDocument();
      expect(screen.getByText("Source Details:")).toBeInTheDocument();
    });

    it("formats policy information with bullets", () => {
      const { container } = render(<PolicyViewer policy={mockPolicy} />);

      const bullets = Array.from(container.querySelectorAll(".flex-shrink-0")).filter(
        (el) => el.textContent === "▪"
      );
      expect(bullets.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("handles very long policy explanations", () => {
      const longExplanation =
        "This is a very long explanation that might wrap to multiple lines and should still render correctly without causing layout issues or truncation.";

      const policyWithLongText: CredentialPolicy = {
        ...mockPolicy,
        disclosurePolicy: {
          ...mockPolicy.disclosurePolicy,
          amountExplanation: longExplanation,
        },
      };

      render(<PolicyViewer policy={policyWithLongText} />);

      expect(screen.getByText(longExplanation)).toBeInTheDocument();
    });

    it("handles special characters in policy text", () => {
      const policyWithSpecialChars: CredentialPolicy = {
        ...mockPolicy,
        disclosurePolicy: {
          ...mockPolicy.disclosurePolicy,
          summary: "Test with special chars: & < > \" '",
        },
      };

      render(<PolicyViewer policy={policyWithSpecialChars} />);

      expect(screen.getByText(/Test with special chars/)).toBeInTheDocument();
    });

    it("handles many warnings", () => {
      const manyWarnings = Array.from({ length: 10 }, (_, i) => ({
        level: (["info", "caution", "warning"] as const)[i % 3],
        message: `Warning ${i + 1}`,
      }));

      const policyWithManyWarnings: CredentialPolicy = {
        ...mockPolicy,
        warnings: manyWarnings,
      };

      render(<PolicyViewer policy={policyWithManyWarnings} />);

      expect(screen.getByText("Warning 1")).toBeInTheDocument();
      expect(screen.getByText("Warning 10")).toBeInTheDocument();
    });
  });
});
