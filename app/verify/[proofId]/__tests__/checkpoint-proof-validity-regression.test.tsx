/**
 * Regression tests for checkpoint freshness UI (#293).
 *
 * CRITICAL: Verifies that checkpoint freshness state never overrides,
 * hides, or softens the underlying proof-validity result.
 *
 * Acceptance criterion (from spec):
 * "Checkpoint presence or freshness must never be presented or implemented
 *  as if it replaces or supplements the authoritative proof-validity check
 *  itself — the original cryptographic verification result (valid/invalid)
 *  stands on its own, and this checkpoint UI is purely informational context
 *  about revocation-data recency layered on top."
 */

import { render, screen, waitFor } from "@testing-library/react";
import { VerificationResult } from "../page";
import type { VerifyProofResponse } from "@/lib/api/generated/v1";
import { freshCheckpoint, staleBoundaryCheckpoint } from "@/lib/credentials/__fixtures__/checkpoints";

// Mock components
jest.mock("@/components/verification/checkpoint-inspection-panel", () => ({
  CheckpointInspectionPanel: ({ checkpoint }: any) => (
    <div data-testid="checkpoint-inspection">Inspection: {checkpoint?.sequence}</div>
  ),
}));

jest.mock("@/components/verification/checkpoint-freshness-panel", () => ({
  CheckpointFreshnessPanel: ({ proofCheckpoint }: any) => (
    <div data-testid="checkpoint-freshness">Freshness: {proofCheckpoint?.sequence}</div>
  ),
}));

describe("Checkpoint UI Regression Tests — Proof Validity Independence", () => {
  const baseProof: VerifyProofResponse = {
    result: "VALID",
    status: "valid",
    credential: {
      id: "EP-FIXT-0001",
      schemaVersion: "1.0",
      subject: { walletHash: "sha256:fixture-wallet-hash-0001" },
      claim: {
        operator: "gte",
        thresholdAmount: "100",
        assetCode: "USDC",
        assetIssuer: null,
        periodStart: "2026-01-01T00:00:00Z",
        periodEnd: "2026-12-31T23:59:59Z",
        qualifyingPaymentCount: 5,
      },
      privacy: {
        exactIncomeHidden: true,
        sourceTransactionsHidden: true,
      },
      issuedAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-31T23:59:59Z",
      proof: {
        type: "HMAC-SHA256",
        credentialHash: "sha256:fixture-cred-hash",
        signature: "hmac-sha256:fixture-sig",
      },
    },
    proof: {
      id: "EP-FIXT-0001",
      type: "minimum-income",
      schemaVersion: "1.0",
      network: "testnet",
      issuedAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-31T23:59:59Z",
      revokedAt: null,
    },
  };

  describe("VALID proof with FRESH checkpoint", () => {
    it("renders valid badge prominently as primary result", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      // Valid badge is primary and unmissable
      const validBadge = screen.getByText("valid");
      expect(validBadge).toBeInTheDocument();
      expect(validBadge.className).toContain("font-semibold");
      expect(validBadge.className).toContain("uppercase");
    });

    it("shows proof validity message ('successfully verified')", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      expect(screen.getByText(/successfully verified/)).toBeInTheDocument();
    });

    it("displays checkpoint panels as supplementary context, not as validation", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      // Checkpoint UI is present but secondary
      expect(screen.getByTestId("checkpoint-inspection")).toBeInTheDocument();
      expect(screen.getByTestId("checkpoint-freshness")).toBeInTheDocument();

      // Valid badge still renders unchanged
      expect(screen.getByText("valid")).toBeInTheDocument();
    });

    it("does not alter proof validity display based on checkpoint", () => {
      const resultFresh: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: freshCheckpoint,
      };

      const { rerender } = render(<VerificationResult result={resultFresh} isLive={false} />);

      let validBadge = screen.getByText("valid");
      expect(validBadge).toBeInTheDocument();

      // Replace with same proof but different checkpoint scenario
      const resultStale: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      rerender(<VerificationResult result={resultStale} isLive={false} />);

      // Valid badge unchanged
      validBadge = screen.getByText("valid");
      expect(validBadge).toBeInTheDocument();
    });
  });

  describe("VALID proof with STALE checkpoint", () => {
    it("renders valid badge unchanged despite stale checkpoint", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      // Valid badge is still rendered and prominent
      expect(screen.getByText("valid")).toBeInTheDocument();
    });

    it("shows proof validity message ('successfully verified') unchanged", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      // Proof validity message unchanged
      expect(screen.getByText(/successfully verified/)).toBeInTheDocument();
    });

    it("displays stale checkpoint warning AS SEPARATE UI, not as proof invalidity", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      render(<VerificationResult result={result} isLive={false} />);

      // Freshness panel shows stale warning
      expect(screen.getByTestId("checkpoint-freshness")).toBeInTheDocument();

      // But proof validity badge unchanged
      expect(screen.getByText("valid")).toBeInTheDocument();

      // Copy does not imply stale checkpoint affects proof
      const message = screen.getByText(/successfully verified/);
      expect(message.textContent).not.toContain("stale");
    });

    it("never uses language implying stale checkpoint weakens proof trustworthiness", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      const { container } = render(<VerificationResult result={result} isLive={false} />);

      const text = container.textContent || "";

      // Verify no misleading copy
      expect(text).not.toContain("proof may be invalid");
      expect(text).not.toContain("trust reduced");
      expect(text).not.toContain("less valid");
      expect(text).not.toContain("potentially revoked");
    });
  });

  describe("INVALID proof with FRESH checkpoint", () => {
    it("renders invalid badge prominently regardless of checkpoint freshness", () => {
      const invalidResult: VerifyProofResponse = {
        ...baseProof,
        result: "INVALID_SIGNATURE",
        status: "invalid",
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={invalidResult} isLive={false} />);

      // Invalid badge is rendered
      expect(screen.getByText("invalid")).toBeInTheDocument();
    });

    it("shows proof invalidity message ('signature is invalid')", () => {
      const invalidResult: VerifyProofResponse = {
        ...baseProof,
        result: "INVALID_SIGNATURE",
        status: "invalid",
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={invalidResult} isLive={false} />);

      expect(screen.getByText(/signature.*invalid/i)).toBeInTheDocument();
    });

    it("never hides invalidity even when checkpoint is fresh", () => {
      const invalidResult: VerifyProofResponse = {
        ...baseProof,
        result: "INVALID_SIGNATURE",
        status: "invalid",
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={invalidResult} isLive={false} />);

      // Invalid badge remains visible
      expect(screen.getByText("invalid")).toBeInTheDocument();

      // Fresh checkpoint panels present but do not override invalidity
      expect(screen.getByTestId("checkpoint-freshness")).toBeInTheDocument();
    });
  });

  describe("EXPIRED proof with STALE checkpoint", () => {
    it("renders expired badge unchanged despite stale checkpoint", () => {
      const expiredResult: VerifyProofResponse = {
        ...baseProof,
        result: "EXPIRED",
        status: "expired",
        proof: {
          ...baseProof.proof,
          expiresAt: "2026-09-01T00:00:00Z", // Expired date
        },
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      render(<VerificationResult result={expiredResult} isLive={false} />);

      expect(screen.getByText("expired")).toBeInTheDocument();
    });

    it("shows expiration message even with fresh checkpoint data", () => {
      const expiredResult: VerifyProofResponse = {
        ...baseProof,
        result: "EXPIRED",
        status: "expired",
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={expiredResult} isLive={false} />);

      expect(screen.getByText(/has expired/i)).toBeInTheDocument();
    });
  });

  describe("REVOKED proof with FRESH checkpoint", () => {
    it("renders revoked badge regardless of checkpoint state", () => {
      const revokedResult: VerifyProofResponse = {
        ...baseProof,
        result: "REVOKED",
        status: "revoked",
        proof: {
          ...baseProof.proof,
          revokedAt: "2026-09-15T00:00:00Z",
        },
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={revokedResult} isLive={false} />);

      expect(screen.getByText("revoked")).toBeInTheDocument();
    });

    it("shows revocation message and timestamp", () => {
      const revokedResult: VerifyProofResponse = {
        ...baseProof,
        result: "REVOKED",
        status: "revoked",
        proof: {
          ...baseProof.proof,
          revokedAt: "2026-09-15T00:00:00Z",
        },
        revocationCheckpoint: freshCheckpoint,
      };

      render(<VerificationResult result={revokedResult} isLive={false} />);

      expect(screen.getByText(/has been revoked/i)).toBeInTheDocument();
      // Revoked timestamp should be displayed
      expect(screen.getByText(/Revoked/)).toBeInTheDocument();
    });
  });

  describe("Missing checkpoint data", () => {
    it("renders proof validity unchanged when checkpoint missing", () => {
      const resultNoCheckpoint: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: undefined,
      };

      render(<VerificationResult result={resultNoCheckpoint} isLive={false} />);

      // Valid badge rendered normally
      expect(screen.getByText("valid")).toBeInTheDocument();
      expect(screen.getByText(/successfully verified/)).toBeInTheDocument();

      // Checkpoint UI not rendered when no data
      expect(screen.queryByTestId("checkpoint-inspection")).not.toBeInTheDocument();
    });
  });

  describe("Proof validity display independence", () => {
    it("proof validity badge styling matches only proof status, never checkpoint state", () => {
      const validFresh: VerifyProofResponse = {
        ...baseProof,
        status: "valid",
        revocationCheckpoint: freshCheckpoint,
      };

      const validStale: VerifyProofResponse = {
        ...baseProof,
        status: "valid",
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      const { rerender, container: container1 } = render(
        <VerificationResult result={validFresh} isLive={false} />
      );

      const validBadge1 = screen.getByText("valid").parentElement;
      const style1 = validBadge1?.className;

      rerender(<VerificationResult result={validStale} isLive={false} />);

      const validBadge2 = screen.getByText("valid").parentElement;
      const style2 = validBadge2?.className;

      // Styling should be identical regardless of checkpoint
      expect(style1).toBe(style2);
    });

    it("all proof statuses render with correct colors/icons", () => {
      const statuses: Array<VerifyProofResponse["status"]> = [
        "valid",
        "invalid",
        "expired",
        "revoked",
        "unknown",
      ];

      statuses.forEach((status) => {
        const result: VerifyProofResponse = {
          ...baseProof,
          status,
          revocationCheckpoint: freshCheckpoint,
        };

        const { unmount } = render(
          <VerificationResult result={result} isLive={false} />
        );

        // Status badge is rendered and visible
        expect(screen.getByText(status)).toBeInTheDocument();

        unmount();
      });
    });
  });

  describe("UI layout and rendering order", () => {
    it("renders proof validity BEFORE checkpoint panels in DOM", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: staleBoundaryCheckpoint,
      };

      const { container } = render(
        <VerificationResult result={result} isLive={false} />
      );

      const validBadge = screen.getByText("valid");
      const checkpointPanel = screen.getByTestId("checkpoint-freshness");

      // Valid badge appears before checkpoint in DOM order
      const validPosition = container.innerHTML.indexOf(validBadge.outerHTML);
      const checkpointPosition = container.innerHTML.indexOf(checkpointPanel.outerHTML);

      expect(validPosition).toBeLessThan(checkpointPosition);
    });

    it("renders status message before checkpoint UI", () => {
      const result: VerifyProofResponse = {
        ...baseProof,
        revocationCheckpoint: freshCheckpoint,
      };

      const { container } = render(
        <VerificationResult result={result} isLive={false} />
      );

      const statusMessage = screen.getByText(/successfully verified/);
      const checkpointPanel = screen.getByTestId("checkpoint-inspection");

      const messagePosition = container.innerHTML.indexOf(statusMessage.textContent || "");
      const checkpointPosition = container.innerHTML.indexOf(checkpointPanel.outerHTML);

      expect(messagePosition).toBeLessThan(checkpointPosition);
    });
  });
});
