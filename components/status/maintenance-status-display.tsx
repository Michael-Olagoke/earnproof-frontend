/**
 * Maintenance and deployment drain status display component.
 *
 * Renders the current maintenance/drain state from the backend, including:
 * - Current phase (normal, draining, drained, recovering)
 * - Affected capabilities (write actions currently blocked)
 * - Estimated completion window (only when server provides evidence; never fabricated)
 * - Queued operations (waiting to resume after drain)
 * - Recovery progress (during recovering phase)
 *
 * Critical acceptance criterion (#295): This component never displays a time
 * estimate without server evidence. If the server provides no estimatedCompletionAt,
 * the UI shows "unknown" rather than computing or guessing a timeline.
 *
 * Renders nothing during normal phase (no drain in progress).
 */

"use client";

import { MaintenanceStatusState, getPhaseDescription, getEstimatedCompletion } from "@/lib/deployment/maintenance-status";
import { Timestamp } from "@/components/common/timestamp";
import { defineMessages } from "@/lib/i18n";

const messages = defineMessages("maintenance-status", {
  phaseLabel: "Maintenance phase",
  affectedCapabilitiesLabel: "Affected capabilities",
  noAffectedCapabilities: "None",
  estimatedCompletionLabel: "Estimated completion",
  completionUnknown: "Unknown",
  queuedOperationsLabel: "Queued operations",
  queuedOperationsCount: "{count} operation{count, plural, one {} other {s}} waiting",
  recoveryProgressLabel: "Recovery progress",
  recoveryProgressSummary: "{current} of {total} operation{total, plural, one {} other {s}} restored",
  statusUnavailable: "Status unavailable",
  statusUnavailableDescription: "Could not retrieve current maintenance status. The system status may be unknown.",
  statusMalformed: "Status data error",
  statusMalformedDescription: "The status data is malformed. Try refreshing the page.",
  statusStale: "Status may be outdated",
  statusStaleSummary: "Last update was {age} seconds ago. The system may have changed.",
  lastUpdated: "Last updated: {time}",
});

export interface MaintenanceStatusDisplayProps {
  state: MaintenanceStatusState | null;
  isDataLive: boolean;
  lastUpdated: Date | null;
  loading?: boolean;
  onRefresh?: () => void;
}

/**
 * Phase badge styling — visually distinguish each phase.
 */
function getPhaseStyling(phase: string): { container: string; badge: string; text: string } {
  switch (phase) {
    case "normal":
      return {
        container: "border-green-300/30 bg-green-300/10",
        badge: "border-green-300/50 bg-green-300/10 text-green-100",
        text: "text-green-200",
      };
    case "draining":
      return {
        container: "border-amber-300/30 bg-amber-300/10",
        badge: "border-amber-300/50 bg-amber-300/10 text-amber-100",
        text: "text-amber-200",
      };
    case "drained":
      return {
        container: "border-rose-300/30 bg-rose-300/10",
        badge: "border-rose-300/50 bg-rose-300/10 text-rose-100",
        text: "text-rose-200",
      };
    case "recovering":
      return {
        container: "border-cyan-300/30 bg-cyan-300/10",
        badge: "border-cyan-300/50 bg-cyan-300/10 text-cyan-100",
        text: "text-cyan-200",
      };
    default:
      return {
        container: "border-slate-300/30 bg-slate-300/10",
        badge: "border-slate-300/50 bg-slate-300/10 text-slate-100",
        text: "text-slate-200",
      };
  }
}

/**
 * Renders a single capability name as a badge.
 */
function CapabilityBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300">
      {name}
    </span>
  );
}

/**
 * Renders the estimated completion time if available, or "Unknown" if not.
 *
 * Critical: only renders if the server actually provided the time; never computes
 * or guesses a client-side estimate.
 */
function EstimatedCompletion({ state }: { state: MaintenanceStatusState }) {
  const estimate = getEstimatedCompletion(state);

  if (!estimate) {
    return (
      <span className="text-sm text-slate-400">
        {messages.completionUnknown}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Timestamp dateTime={estimate} variant="relative" />
      <span className="text-xs text-slate-400">(server-provided estimate)</span>
    </div>
  );
}

/**
 * Renders queued operations summary if any exist.
 */
function QueuedOperationsSummary({ state }: { state: MaintenanceStatusState }) {
  if (state.status !== "valid") {
    return null;
  }

  const { queuedOperations } = state.data;
  if (!queuedOperations || queuedOperations.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-sm font-medium text-slate-300">{messages.queuedOperationsLabel}</div>
      <div className="mt-2 text-sm text-slate-400">
        {formatMessage(messages.queuedOperationsCount, { count: queuedOperations.length })}
      </div>
    </div>
  );
}

/**
 * Renders recovery progress during the "recovering" phase.
 */
function RecoveryProgressBar({ state }: { state: MaintenanceStatusState }) {
  if (state.status !== "valid" || state.data.phase !== "recovering") {
    return null;
  }

  const { recoveryProgress } = state.data;
  if (!recoveryProgress) {
    return null;
  }

  const percentage = recoveryProgress.total > 0
    ? Math.round((recoveryProgress.current / recoveryProgress.total) * 100)
    : 0;

  return (
    <div>
      <div className="text-sm font-medium text-slate-300">{messages.recoveryProgressLabel}</div>
      <div className="mt-2 space-y-2">
        <div className="h-2 rounded-lg bg-slate-700/50">
          <div
            className="h-full rounded-lg bg-cyan-300/50 transition-all duration-300"
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={recoveryProgress.current}
            aria-valuemin={0}
            aria-valuemax={recoveryProgress.total}
          />
        </div>
        <div className="text-xs text-slate-400">
          {formatMessage(messages.recoveryProgressSummary, {
            current: recoveryProgress.current,
            total: recoveryProgress.total,
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Error state when status is unavailable.
 */
function UnavailableState() {
  return (
    <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none text-amber-200" aria-hidden="true">
          ⚠️
        </span>
        <div>
          <h3 className="text-lg font-semibold text-amber-100">{messages.statusUnavailable}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{messages.statusUnavailableDescription}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Error state when status is malformed.
 */
function MalformedState() {
  return (
    <div className="rounded-lg border border-rose-300/30 bg-rose-300/10 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none text-rose-200" aria-hidden="true">
          ⚠️
        </span>
        <div>
          <h3 className="text-lg font-semibold text-rose-100">{messages.statusMalformed}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{messages.statusMalformedDescription}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Warning state when status is stale.
 */
function StaleState({ state, ageMs }: { state: MaintenanceStatusState; ageMs: number }) {
  if (state.status !== "stale") return null;

  const ageSecs = Math.round(ageMs / 1000);

  return (
    <div
      aria-live="polite"
      className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300"
    >
      {formatMessage(messages.statusStaleSummary, { age: ageSecs })}
    </div>
  );
}

/**
 * Normal operation state — renders nothing (no drain in progress).
 * This function is provided for completeness but NormalState is implicitly handled
 * in ValidState by returning null when phase === "normal".
 */

/**
 * Main component — dispatches to appropriate renderer based on state.
 */
export function MaintenanceStatusDisplay({
  state,
  isDataLive,
  lastUpdated,
  loading = false,
  onRefresh,
}: MaintenanceStatusDisplayProps) {
  // No state loaded yet
  if (!state) {
    if (loading) {
      return <div className="animate-pulse text-slate-400">Loading maintenance status...</div>;
    }
    return null;
  }

  // Error states
  if (state.status === "unavailable") {
    return <UnavailableState />;
  }

  if (state.status === "malformed") {
    return <MalformedState />;
  }

  // Stale data
  if (state.status === "stale") {
    return (
      <div className="space-y-4">
        <StaleState state={state} ageMs={state.ageMs} />
        <ValidState state={state} isDataLive={false} lastUpdated={lastUpdated} onRefresh={onRefresh} />
      </div>
    );
  }

  // Valid state
  if (state.status === "valid") {
    return (
      <ValidState state={state} isDataLive={isDataLive} lastUpdated={lastUpdated} onRefresh={onRefresh} />
    );
  }

  return null;
}

/**
 * Renders a valid maintenance status response.
 */
function ValidState({
  state,
  isDataLive,
  lastUpdated,
  onRefresh,
}: {
  state: MaintenanceStatusState;
  isDataLive: boolean;
  lastUpdated: Date | null;
  onRefresh?: () => void;
}) {
  if (state.status !== "valid") return null;

  const { phase, affectedCapabilities } = state.data;

  // Normal phase: no drain in progress, render nothing
  if (phase === "normal") {
    return null;
  }

  const styling = getPhaseStyling(phase);
  const description = getPhaseDescription(phase);

  return (
    <div className={`rounded-lg border p-4 sm:p-5 ${styling.container}`}>
      {/* Header: Phase badge and description */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                phase === "normal"
                  ? "bg-green-300"
                  : phase === "draining"
                    ? "bg-amber-300"
                    : phase === "drained"
                      ? "bg-rose-300"
                      : "bg-cyan-300"
              }`}
              aria-hidden="true"
            />
            <span className={`text-lg font-semibold ${styling.text}`}>{description}</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{messages.phaseLabel}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="rounded-lg border border-white/15 px-3 py-1 text-sm font-medium transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            type="button"
            aria-label="Refresh maintenance status"
          >
            Refresh
          </button>
        )}
      </div>

      {/* Affected capabilities */}
      <div className="mb-5">
        <div className="text-sm font-medium text-slate-300">{messages.affectedCapabilitiesLabel}</div>
        {affectedCapabilities.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {affectedCapabilities.map((capability) => (
              <CapabilityBadge key={capability} name={capability} />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-400">{messages.noAffectedCapabilities}</div>
        )}
      </div>

      {/* Estimated completion */}
      {(phase === "draining" || phase === "recovering") && (
        <div className="mb-5">
          <div className="text-sm font-medium text-slate-300">{messages.estimatedCompletionLabel}</div>
          <div className="mt-2">
            <EstimatedCompletion state={state} />
          </div>
        </div>
      )}

      {/* Queued operations (if any) */}
      {phase === "draining" && <div className="mb-5"><QueuedOperationsSummary state={state} /></div>}

      {/* Recovery progress (during recovering phase) */}
      {phase === "recovering" && (
        <div className="mb-5">
          <RecoveryProgressBar state={state} />
        </div>
      )}

      {/* Last updated timestamp */}
      {lastUpdated && !isDataLive && (
        <div className="border-t border-white/10 pt-3 text-xs text-slate-400 space-y-1">
          <div>{messages.lastUpdated}</div>
          <Timestamp dateTime={lastUpdated.toISOString()} variant="relative" />
        </div>
      )}
    </div>
  );
}
