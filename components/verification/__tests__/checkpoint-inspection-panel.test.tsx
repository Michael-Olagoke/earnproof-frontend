/**
 * Tests for CheckpointInspectionPanel component (#293).
 *
 * Coverage:
 * - Field rendering (sequence, root, algorithm, ledger, observed time)
 * - Hash truncation with expand/collapse button
 * - Copy to clipboard functionality
 * - Null/missing checkpoint handling
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckpointInspectionPanel } from "../checkpoint-inspection-panel";
import { freshCheckpoint, unsupportedAlgorithmCheckpoint } from "@/lib/credentials/__fixtures__/checkpoints";

describe("CheckpointInspectionPanel", () => {
  // Mock clipboard API
  const mockClipboardWrite = jest.fn();
  Object.assign(navigator, {
    clipboard: {
      writeText: mockClipboardWrite,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockClipboardWrite.mockResolvedValue(undefined);
  });

  describe("With valid checkpoint data", () => {
    it("renders checkpoint panel with all fields", () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      expect(screen.getByText("Revocation Checkpoint")).toBeInTheDocument();
      expect(screen.getByText("Sequence")).toBeInTheDocument();
      expect(screen.getByText(String(freshCheckpoint.sequence))).toBeInTheDocument();
      expect(screen.getByText("Algorithm")).toBeInTheDocument();
      expect(screen.getByText(freshCheckpoint.algorithm)).toBeInTheDocument();
      expect(screen.getByText("Root")).toBeInTheDocument();
      expect(screen.getByText("Ledger")).toBeInTheDocument();
      expect(screen.getByText(freshCheckpoint.ledger)).toBeInTheDocument();
      expect(screen.getByText("Observed")).toBeInTheDocument();
    });

    it("displays truncated hash initially", () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const hashDisplay = screen.getByText(/a1b2c3d4e5f6g7h8\.\.\.u1v2w3x4y5/);
      expect(hashDisplay).toBeInTheDocument();
    });

    it("expands to full hash on expand button click", () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const expandButton = screen.getByTitle("Expand");
      fireEvent.click(expandButton);

      const fullHashElement = screen.getByText(freshCheckpoint.root);
      expect(fullHashElement).toBeInTheDocument();
    });

    it("collapses hash back to truncated on collapse button click", () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const expandButton = screen.getByTitle("Expand");
      fireEvent.click(expandButton);

      expect(screen.getByText(freshCheckpoint.root)).toBeInTheDocument();

      const collapseButton = screen.getByTitle("Collapse");
      fireEvent.click(collapseButton);

      expect(screen.queryByText(freshCheckpoint.root)).not.toBeInTheDocument();
    });

    it("copies full hash to clipboard on copy button click", async () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const copyButton = screen.getByTitle("Copy full hash");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboardWrite).toHaveBeenCalledWith(freshCheckpoint.root);
      });
    });

    it("shows 'Copied!' feedback briefly after copying", async () => {
      jest.useFakeTimers();

      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const copyButton = screen.getByTitle("Copy full hash");
      fireEvent.click(copyButton);

      expect(screen.getByTitle("Copied!")).toBeInTheDocument();

      jest.advanceTimersByTime(2000);

      expect(screen.getByTitle("Copy full hash")).toBeInTheDocument();
      expect(screen.queryByTitle("Copied!")).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it("renders different checkpoint data correctly", () => {
      render(<CheckpointInspectionPanel checkpoint={unsupportedAlgorithmCheckpoint} />);

      expect(screen.getByText(String(unsupportedAlgorithmCheckpoint.sequence))).toBeInTheDocument();
      expect(screen.getByText(unsupportedAlgorithmCheckpoint.algorithm)).toBeInTheDocument();
    });

    it("renders Timestamp component for observed time", () => {
      const { container } = render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      // Timestamp component renders a time element
      const timeElements = container.querySelectorAll("time");
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe("With missing/null checkpoint", () => {
    it("renders 'not available' message when checkpoint is null", () => {
      render(<CheckpointInspectionPanel checkpoint={null} />);

      expect(screen.getByText("Checkpoint data not available for this proof")).toBeInTheDocument();
    });

    it("renders 'not available' message when checkpoint is undefined", () => {
      render(<CheckpointInspectionPanel checkpoint={undefined} />);

      expect(screen.getByText("Checkpoint data not available for this proof")).toBeInTheDocument();
    });

    it("does not render expand/collapse or copy buttons when checkpoint is missing", () => {
      render(<CheckpointInspectionPanel checkpoint={null} />);

      expect(screen.queryByTitle("Expand")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Copy full hash")).not.toBeInTheDocument();
    });
  });

  describe("Hash truncation edge cases", () => {
    it("truncates hash correctly: first 16 + ... + last 8 chars", () => {
      const checkpoint = {
        ...freshCheckpoint,
        root: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      };
      render(<CheckpointInspectionPanel checkpoint={checkpoint} />);

      expect(screen.getByText("a1b2c3d4e5f6g7h8...x4y5z6")).toBeInTheDocument();
    });

    it("does not truncate very short hashes", () => {
      const checkpoint = {
        ...freshCheckpoint,
        root: "abcd1234",
      };
      render(<CheckpointInspectionPanel checkpoint={checkpoint} />);

      // Short hash is displayed as-is
      expect(screen.getByText("abcd1234")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("provides descriptive aria-labels for buttons", () => {
      render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      expect(screen.getByLabelText("Expand hash")).toBeInTheDocument();
      expect(screen.getByLabelText("Copy full hash")).toBeInTheDocument();
    });

    it("renders semantic HTML with proper heading hierarchy", () => {
      const { container } = render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const heading = container.querySelector("h3");
      expect(heading).toHaveTextContent("Revocation Checkpoint");
    });

    it("uses dl/dt/dd semantic structure for field display", () => {
      const { container } = render(<CheckpointInspectionPanel checkpoint={freshCheckpoint} />);

      const definitionList = container.querySelector("dl");
      expect(definitionList).toBeInTheDocument();

      const terms = container.querySelectorAll("dt");
      const definitions = container.querySelectorAll("dd");

      expect(terms.length).toBeGreaterThan(0);
      expect(definitions.length).toBeGreaterThan(0);
    });
  });
});
