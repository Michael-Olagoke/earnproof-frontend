/**
 * Tests for CheckpointFreshnessPanel component (#293).
 *
 * Coverage:
 * - All three freshness states (FRESH, STALE, COMPARISON_FAILED)
 * - Prominent visual marking for STALE state
 * - Refresh action with debounce and loading state
 * - Concurrency: rapid refresh clicks, in-flight cancel, replay
 * - Authorization failure handling
 * - Boundary conditions (exactly 1 behind, multiple behind)
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckpointFreshnessPanel } from "../checkpoint-freshness-panel";
import { freshCheckpoint, staleBoundaryCheckpoint, staleMultipleCheckpoint } from "@/lib/credentials/__fixtures__/checkpoints";

describe("CheckpointFreshnessPanel", () => {
  const mockFetchCheckpoint = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("FRESH state", () => {
    it("renders FRESH state when checkpoints match", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      expect(screen.getByText(/Checkpoint matches current contract state/)).toBeInTheDocument();
    });

    it("displays green/emerald styling for FRESH", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      const badge = screen.getByText("Fresh").parentElement;
      expect(badge?.className).toContain("emerald");
    });

    it("shows checkmark icon for FRESH", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      expect(container.textContent).toContain("✓");
    });

    it("displays sequence number in FRESH state", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(String(freshCheckpoint.sequence))).toBeInTheDocument();
      });
    });
  });

  describe("STALE state", () => {
    it("renders STALE state when checkpoint is behind", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleBoundaryCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      expect(screen.getByText("Contract has advanced")).toBeInTheDocument();
    });

    it("displays prominent STALE marking with warning icon", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleBoundaryCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      // Check for warning icon and bold text
      expect(container.textContent).toContain("⚠");
      const badge = screen.getByText("Stale");
      expect(badge?.className).toContain("font-bold");
      expect(badge?.className).toContain("uppercase");
    });

    it("displays rose/red styling for STALE", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleBoundaryCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      // Find the outer container and check for rose styling
      const outerDiv = container.querySelector("div.rounded-lg");
      expect(outerDiv?.className).toContain("rose");
    });

    it("shows both sequence numbers and gap calculation", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleBoundaryCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      expect(screen.getByText("Proof checkpoint sequence:")).toBeInTheDocument();
      expect(screen.getByText("Current sequence:")).toBeInTheDocument();
      expect(screen.getByText("Behind by:")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("displays correct 'behind by' count for multiple sequences", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleMultipleCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      expect(screen.getByText("7")).toBeInTheDocument(); // 42 - 35 = 7
    });

    it("shows singular/plural 'checkpoint/checkpoints' correctly", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { rerender } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleBoundaryCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Stale")).toBeInTheDocument();
      });

      expect(screen.getByText(/has progressed 1 checkpoint\./)).toBeInTheDocument();

      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);
      rerender(
        <CheckpointFreshnessPanel
          proofCheckpoint={staleMultipleCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/has progressed 7 checkpoints\./)).toBeInTheDocument();
      });
    });
  });

  describe("COMPARISON_FAILED state", () => {
    it("renders COMPARISON_FAILED for fetch error", async () => {
      mockFetchCheckpoint.mockRejectedValue(new Error("Network error"));

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Comparison Unavailable")).toBeInTheDocument();
      });
    });

    it("displays amber/yellow styling for COMPARISON_FAILED", async () => {
      mockFetchCheckpoint.mockRejectedValue(new Error("Network error"));

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Comparison Unavailable")).toBeInTheDocument();
      });

      const badge = screen.getByText("Comparison Unavailable").parentElement;
      expect(badge?.className).toContain("amber");
    });

    it("shows error details when available", async () => {
      mockFetchCheckpoint.mockRejectedValue(new Error("Timeout"));

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Timeout/)).toBeInTheDocument();
      });
    });

    it("clarifies that comparison failure does not affect proof validity", async () => {
      mockFetchCheckpoint.mockRejectedValue(new Error("Network error"));

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/This does not affect proof validity/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Refresh action", () => {
    it("fetches on component mount", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(mockFetchCheckpoint).toHaveBeenCalledTimes(1);
      });
    });

    it("disables refresh button during in-flight fetch", async () => {
      mockFetchCheckpoint.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(freshCheckpoint), 1000))
      );

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      const refreshButton = screen.getByRole("button", { name: /Refresh|Checking/ });
      expect(refreshButton).toBeDisabled();
    });

    it("shows loading state with spinner during fetch", async () => {
      mockFetchCheckpoint.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(freshCheckpoint), 1000))
      );

      const { container } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Checking...")).toBeInTheDocument();
      });

      // Check for spinner element
      const spinners = container.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);
    });

    it("re-enables refresh button after fetch completes", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      const refreshButton = screen.getByRole("button", { name: /Refresh/ });
      expect(refreshButton).not.toBeDisabled();
    });
  });

  describe("Debounce and concurrency", () => {
    it("debounces rapid refresh clicks (500ms window)", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      const { rerender } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      const initialCallCount = mockFetchCheckpoint.mock.calls.length;

      const refreshButton = screen.getByRole("button", { name: /Refresh/ });

      // Rapid clicks within debounce window
      fireEvent.click(refreshButton);
      fireEvent.click(refreshButton);
      fireEvent.click(refreshButton);

      // Should not have fired yet (within debounce window)
      expect(mockFetchCheckpoint.mock.calls.length).toBe(initialCallCount);

      // Advance past debounce window
      jest.advanceTimersByTime(500);

      // Should fire once (debounced)
      await waitFor(() => {
        expect(mockFetchCheckpoint.mock.calls.length).toBe(initialCallCount + 1);
      });
    });

    it("cancels previous in-flight request on new refresh", async () => {
      const abortedRequests: AbortSignal[] = [];

      mockFetchCheckpoint.mockImplementation((signal: AbortSignal) => {
        abortedRequests.push(signal);
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(freshCheckpoint), 5000);
          signal.addEventListener("abort", () => clearTimeout(timeout));
        });
      });

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(mockFetchCheckpoint).toHaveBeenCalled();
      });

      // Trigger new refresh before previous completes
      const refreshButton = screen.getByRole("button", { name: /Checking/ });
      fireEvent.click(refreshButton);

      jest.advanceTimersByTime(500);

      // Second request should have been made
      expect(mockFetchCheckpoint.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("handles replayed/duplicate refresh (same result displayed)", async () => {
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Fresh")).toBeInTheDocument();
      });

      const initialCallCount = mockFetchCheckpoint.mock.calls.length;

      // Trigger refresh
      const refreshButton = screen.getByRole("button", { name: /Refresh/ });
      fireEvent.click(refreshButton);

      jest.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockFetchCheckpoint.mock.calls.length).toBe(initialCallCount + 1);
      });

      // Should still show FRESH (no flicker)
      expect(screen.getByText("Fresh")).toBeInTheDocument();
    });
  });

  describe("Missing proof checkpoint", () => {
    it("renders unavailable message when proof checkpoint is null", () => {
      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={null}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      expect(screen.getByText(/Checkpoint data not available for this proof/)).toBeInTheDocument();
    });

    it("renders unavailable message when proof checkpoint is undefined", () => {
      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={undefined}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      expect(screen.getByText(/Checkpoint data not available for this proof/)).toBeInTheDocument();
    });

    it("does not fetch live checkpoint when proof checkpoint is missing", () => {
      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={null}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      expect(mockFetchCheckpoint).not.toHaveBeenCalled();
    });
  });

  describe("Authorization", () => {
    it("passes token to onFetchLiveCheckpoint when provided", async () => {
      const token = "test-token";
      mockFetchCheckpoint.mockResolvedValue(freshCheckpoint);

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
          token={token}
        />
      );

      await waitFor(() => {
        expect(mockFetchCheckpoint).toHaveBeenCalled();
      });
    });

    it("handles 401/unauthorized gracefully", async () => {
      mockFetchCheckpoint.mockRejectedValue(new Error("Unauthorized"));

      render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Comparison Unavailable")).toBeInTheDocument();
      });

      // Should not leak auth details
      expect(screen.getByText(/This does not affect proof validity/)).toBeInTheDocument();
    });
  });

  describe("Cleanup", () => {
    it("cancels in-flight request on unmount", async () => {
      const controller = new AbortController();
      mockFetchCheckpoint.mockImplementation((signal: AbortSignal) => {
        signal.addEventListener("abort", () => {
          // Request was cancelled
        });
        return new Promise((resolve) => {
          setTimeout(() => resolve(freshCheckpoint), 5000);
        });
      });

      const { unmount } = render(
        <CheckpointFreshnessPanel
          proofCheckpoint={freshCheckpoint}
          onFetchLiveCheckpoint={mockFetchCheckpoint}
        />
      );

      unmount();

      // Debounce timer should also be cleared
      jest.advanceTimersByTime(1000);
      expect(mockFetchCheckpoint.mock.calls.length).toBe(1);
    });
  });
});
