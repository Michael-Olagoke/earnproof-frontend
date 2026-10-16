/**
 * Tests for MaintenanceStatusDisplay component.
 *
 * Coverage:
 * - Positive: renders all phases correctly (normal, draining, drained, recovering)
 * - Estimated window: server-provided shows; no-estimate shows "Unknown"
 * - Affected capabilities: rendered as badges
 * - Queued operations: summary rendered when present
 * - Recovery progress: bar rendered during recovering phase
 * - Error states: unavailable, malformed, stale
 * - Null during normal phase
 */

import { render, screen } from "@testing-library/react";
import { MaintenanceStatusDisplay } from "@/components/status/maintenance-status-display";
import type { MaintenanceStatusState } from "@/lib/deployment/maintenance-status";

// Mock i18n
jest.mock("@/lib/i18n", () => ({
  defineMessages: jest.fn((domain, messages) => messages),
  formatMessage: jest.fn((msg, values) => {
    if (typeof msg === "string") return msg;
    if (msg.count) return `${values.count} operations waiting`;
    if (msg.current) return `${values.current} of ${values.total} operations restored`;
    if (msg.age) return `Status may be ${values.age} seconds old`;
    if (msg.time) return `Last updated: ${values.time}`;
    return JSON.stringify(msg);
  }),
}));

// Mock Timestamp component
jest.mock("@/components/common/timestamp", () => ({
  Timestamp: ({ dateTime }: { dateTime: string }) => <span>{new Date(dateTime).toLocaleString()}</span>,
}));

describe("MaintenanceStatusDisplay component", () => {
  describe("positive: renders all phases", () => {
    it("renders nothing during normal phase", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "normal",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
        },
      };

      const { container } = render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders draining phase with affected capabilities", () => {
      const now = new Date().toISOString();
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: ["proofs:create", "payments:sync"],
          estimatedCompletionAt: new Date(Date.now() + 60000).toISOString(),
          timestamp: now,
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={new Date()}
        />,
      );

      expect(screen.getByText(/paused/i)).toBeInTheDocument();
      expect(screen.getByText("proofs:create")).toBeInTheDocument();
      expect(screen.getByText("payments:sync")).toBeInTheDocument();
    });

    it("renders drained phase", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "drained",
          affectedCapabilities: ["proofs:create", "payments:sync"],
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/locked/i)).toBeInTheDocument();
    });

    it("renders recovering phase with progress bar", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "recovering",
          affectedCapabilities: ["proofs:create"],
          recoveryProgress: { current: 5, total: 10 },
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/Restoring/i)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText(/5 of 10/i)).toBeInTheDocument();
    });
  });

  describe("estimated window: server evidence only", () => {
    it("shows server-provided estimated completion", () => {
      const now = new Date().toISOString();
      const estimate = new Date(Date.now() + 120000).toISOString();

      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          estimatedCompletionAt: estimate,
          timestamp: now,
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      // Should show the estimate and indicate it's server-provided
      expect(screen.getByText(/server-provided/i)).toBeInTheDocument();
    });

    it("shows 'Unknown' when no estimate provided", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
          // No estimatedCompletionAt
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
      // Should NOT show any time estimate
      expect(screen.queryByText(/server-provided/i)).not.toBeInTheDocument();
    });

    it("shows 'Unknown' when estimate is null", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          estimatedCompletionAt: null,
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
    });
  });

  describe("affected capabilities", () => {
    it("shows 'None' when no capabilities affected", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/None/i)).toBeInTheDocument();
    });

    it("renders each affected capability as a badge", () => {
      const capabilities = ["proofs:create", "payments:sync", "payments:classify"];

      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "drained",
          affectedCapabilities: capabilities,
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      capabilities.forEach((cap) => {
        expect(screen.getByText(cap)).toBeInTheDocument();
      });
    });
  });

  describe("queued operations", () => {
    it("shows queued operations count when present", () => {
      const now = new Date().toISOString();

      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          queuedOperations: [
            { id: "op-1", type: "proof_creation", enqueuedAt: now },
            { id: "op-2", type: "proof_creation", enqueuedAt: now },
            { id: "op-3", type: "proof_creation", enqueuedAt: now },
          ],
          timestamp: now,
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/3 operations/i)).toBeInTheDocument();
    });

    it("does not show queued operations section when empty", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          queuedOperations: [],
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.queryByText(/Queued operations/i)).not.toBeInTheDocument();
    });

    it("does not show queued operations section during recovering phase", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "recovering",
          affectedCapabilities: [],
          recoveryProgress: { current: 0, total: 10 },
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      expect(screen.queryByText(/Queued operations/i)).not.toBeInTheDocument();
    });
  });

  describe("error states", () => {
    it("renders unavailable state message", () => {
      const state: MaintenanceStatusState = {
        status: "unavailable",
        reason: "Could not reach endpoint",
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={false}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/Status unavailable/i)).toBeInTheDocument();
    });

    it("renders malformed state message", () => {
      const state: MaintenanceStatusState = {
        status: "malformed",
        reason: "Invalid document",
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={false}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/Status data error/i)).toBeInTheDocument();
    });

    it("renders stale state warning with age", () => {
      const state: MaintenanceStatusState = {
        status: "stale",
        data: {
          phase: "normal",
          affectedCapabilities: [],
          timestamp: new Date(Date.now() - 65000).toISOString(),
        },
        ageMs: 65000,
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={false}
          lastUpdated={null}
        />,
      );

      expect(screen.getByText(/may be outdated/i)).toBeInTheDocument();
    });
  });

  describe("null/loading states", () => {
    it("renders null when no state provided", () => {
      const { container } = render(
        <MaintenanceStatusDisplay
          state={null}
          isDataLive={false}
          lastUpdated={null}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("shows loading message when loading and no data", () => {
      render(
        <MaintenanceStatusDisplay
          state={null}
          isDataLive={false}
          lastUpdated={null}
          loading={true}
        />,
      );

      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });
  });

  describe("stale data indicator", () => {
    it("shows last updated timestamp when data is stale", () => {
      const lastUpdated = new Date();

      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={false}
          lastUpdated={lastUpdated}
        />,
      );

      expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
    });

    it("does not show last updated when data is live", () => {
      const lastUpdated = new Date();

      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "normal",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={lastUpdated}
        />,
      );

      // Normal phase renders nothing anyway
      expect(screen.queryByText(/Last updated/i)).not.toBeInTheDocument();
    });
  });

  describe("refresh button", () => {
    it("renders refresh button when onRefresh callback provided", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
        },
      };

      const handleRefresh = jest.fn();

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
          onRefresh={handleRefresh}
        />,
      );

      const button = screen.getByRole("button", { name: /Refresh/i });
      expect(button).toBeInTheDocument();
    });

    it("does not render refresh button when onRefresh not provided", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "draining",
          affectedCapabilities: [],
          timestamp: new Date().toISOString(),
        },
      };

      render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      const button = document.querySelector('button[aria-label*="Refresh"]');
      expect(button).not.toBeInTheDocument();
    });
  });

  describe("recovery progress", () => {
    it("shows recovery progress bar with correct percentage", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "recovering",
          affectedCapabilities: [],
          recoveryProgress: { current: 7, total: 10 },
          timestamp: new Date().toISOString(),
        },
      };

      const { container } = render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "7");
      expect(progressBar).toHaveAttribute("aria-valuemax", "10");

      // Check that the visual progress bar is approximately 70% filled
      const innerBar = container.querySelector('[role="progressbar"] > div');
      expect(innerBar).toHaveStyle({ width: "70%" });
    });

    it("handles recovering phase with 0 progress", () => {
      const state: MaintenanceStatusState = {
        status: "valid",
        data: {
          phase: "recovering",
          affectedCapabilities: [],
          recoveryProgress: { current: 0, total: 10 },
          timestamp: new Date().toISOString(),
        },
      };

      const { container } = render(
        <MaintenanceStatusDisplay
          state={state}
          isDataLive={true}
          lastUpdated={null}
        />,
      );

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "0");
    });
  });
});
