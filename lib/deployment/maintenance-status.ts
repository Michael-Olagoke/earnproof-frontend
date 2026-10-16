/**
 * Maintenance and deployment drain status monitoring (#295).
 *
 * Disclosed scope gap: there is no maintenance/drain status endpoint anywhere
 * in this API's OpenAPI spec (lib/api/openapi/earnproof-api.v1.json only has
 * /health, /auth/*, /payments/*, /proofs/*, /issuers/*, /organizations/*,
 * /api-keys/*, /webhooks/* currently). Following this repo's own precedent
 * for similar gaps (deployment-metadata.ts documents a missing deployment
 * endpoint; #141's PR disclosed a missing contract-sync endpoint), this module
 * defines the client's expected contract for that endpoint
 * (MaintenanceStatusDocument below) and implements the verification and
 * rendering logic against it. The actual backend endpoint (GET /status/drain,
 * assumed here) does not exist yet and needs to be added to the API before
 * this can run against a real deployment.
 *
 * Critical acceptance criteria from #295:
 * - The UI never promises timing without server evidence (no client-side
 *   estimates, no default placeholder times)
 * - Write actions never remain enabled while their capability is reported
 *   as unavailable/drained
 * - Failure, stale-state, replay, authorization, and exact-boundary behavior
 *   is deterministic and documented
 *
 * Data sources and field meanings:
 * - `phase`: Current deployment state (normal, draining, drained, recovering).
 *   Server moves through these atomically during a coordinated drain event.
 * - `affectedCapabilities`: Array of capability names currently affected
 *   (e.g., ["proofs:create", "payments:sync"]). Empty array means no writes
 *   are blocked. This is sourced entirely from the backend's current state.
 * - `estimatedCompletionAt`: ISO 8601 timestamp when the server expects to
 *   exit draining state. Present ONLY when the backend has computed real
 *   evidence (e.g., in-flight request count, worker batch processing time).
 *   If absent/null, UI must show "unknown" rather than computing a client-side
 *   estimate. Server never includes this field with a placeholder value.
 * - `queuedOperations`: Array of operations waiting for drain to end.
 *   Each has id, type (e.g., "proof_creation"), and enqueuedAt (ISO 8601).
 *   Present only if the backend tracks this; may be empty array or absent.
 * - `recoveryProgress`: Object with `current` and `total` fields during
 *   recovering phase. Indicates how many deferred writes have been processed.
 *   Absent during other phases.
 */

import { apiClient } from "@/lib/api/client";

/**
 * The phase enums as defined by the backend. Each represents a distinct
 * deployment state during coordinated drain:
 *
 * - "normal": All writes and reads available; no drain in progress.
 * - "draining": Writes are being queued/paused; reads still available. The
 *   backend is processing in-flight requests before lock-down.
 * - "drained": All writes are stopped; reads available. Safe for rollout.
 * - "recovering": Drained writes are being replayed and re-enabled; new
 *   writes remain blocked until "normal" is reached.
 */
export type MaintenancePhase = "normal" | "draining" | "drained" | "recovering";

/**
 * A single queued operation waiting for drain to end. The backend includes
 * these only if it tracks queued operations; clients must handle both
 * presence and absence deterministically.
 */
export interface QueuedOperation {
  id: string;
  type: string;
  enqueuedAt: string; // ISO 8601
}

/**
 * Recovery progress tracking during the "recovering" phase. Indicates how
 * many deferred writes have been replayed. Present only during "recovering";
 * absent in all other phases.
 */
export interface RecoveryProgress {
  current: number;
  total: number;
}

/**
 * The signed/authenticated maintenance status document, as this client expects it.
 * Retrieved from GET /status/drain (assumed endpoint; needs backend implementation).
 *
 * Unlike DeploymentMetadataDocument, this is NOT cryptographically signed — it's
 * a live status response from the backend API and need only reach the client
 * over authenticated HTTPS. Stale-detection is purely age-based (see
 * MAINTENANCE_STATUS_MAX_AGE_MS).
 */
export interface MaintenanceStatusDocument {
  phase: MaintenancePhase;
  affectedCapabilities: string[];
  estimatedCompletionAt?: string | null; // ISO 8601, present only with server evidence
  queuedOperations?: QueuedOperation[]; // May be empty or absent
  recoveryProgress?: RecoveryProgress; // Present only during "recovering" phase
  timestamp: string; // ISO 8601, issued server-side for stale-detection
}

export type MaintenanceStatusState =
  | { status: "valid"; data: MaintenanceStatusDocument }
  | { status: "stale"; data: MaintenanceStatusDocument; ageMs: number }
  | { status: "malformed"; reason: string }
  | { status: "unavailable"; reason: string };

/**
 * How old a maintenance status response may be before it's treated as stale
 * rather than valid. Unlike deployment metadata (which is signed and has a
 * backend-declared TTL conceptually), this is live API state, so we use a
 * shorter window. If the backend hasn't sent an update in this time, we
 * assume we're operating on incomplete information.
 *
 * Rationale: during an active drain event, staleness is a real hazard (a
 * client relying on a 5-minute-old "draining" status might miss the transition
 * to "drained" and attempt a write). Shorter TTL forces polling refreshes.
 */
export const MAINTENANCE_STATUS_MAX_AGE_MS = 30 * 1000; // 30 seconds

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMaintenancePhase(value: unknown): value is MaintenancePhase {
  return value === "normal" || value === "draining" || value === "drained" || value === "recovering";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseQueuedOperations(value: unknown): QueuedOperation[] | undefined {
  if (!value) return undefined;
  if (!Array.isArray(value)) return undefined;

  const result: QueuedOperation[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.type === "string" &&
      typeof item.enqueuedAt === "string"
    ) {
      result.push({
        id: item.id,
        type: item.type,
        enqueuedAt: item.enqueuedAt,
      });
    }
  }
  return result.length > 0 ? result : undefined;
}

function parseRecoveryProgress(value: unknown): RecoveryProgress | undefined {
  if (!value || !isRecord(value)) return undefined;

  const { current, total } = value;
  if (typeof current === "number" && typeof total === "number" && current >= 0 && total > 0) {
    return { current, total };
  }
  return undefined;
}

/**
 * Validates the shape of a raw API response before trusting any of its
 * fields. Returns null if parsing fails; enforces the exact structure
 * expected without optional chaining shortcuts that could hide malformed data.
 */
function parseDocument(raw: unknown): MaintenanceStatusDocument | null {
  if (!isRecord(raw)) return null;

  const {
    phase,
    affectedCapabilities,
    estimatedCompletionAt,
    queuedOperations,
    recoveryProgress,
    timestamp,
  } = raw;

  // Validate required fields
  if (
    !isMaintenancePhase(phase) ||
    !isStringArray(affectedCapabilities) ||
    typeof timestamp !== "string" ||
    Number.isNaN(new Date(timestamp).getTime())
  ) {
    return null;
  }

  // Validate optional fields
  if (estimatedCompletionAt !== undefined && estimatedCompletionAt !== null) {
    if (typeof estimatedCompletionAt !== "string" || Number.isNaN(new Date(estimatedCompletionAt).getTime())) {
      return null;
    }
  }

  const parsedQueued = parseQueuedOperations(queuedOperations);
  const parsedRecovery = parseRecoveryProgress(recoveryProgress);

  // If recovery progress is present, we must be in "recovering" phase
  if (parsedRecovery && phase !== "recovering") {
    return null;
  }

  return {
    phase,
    affectedCapabilities,
    estimatedCompletionAt: (estimatedCompletionAt as string | null | undefined) ?? undefined,
    queuedOperations: parsedQueued,
    recoveryProgress: parsedRecovery,
    timestamp,
  };
}

/**
 * Fetches and validates the maintenance/drain status document, returning one
 * of four states: valid, stale, malformed, or unavailable. Never throws —
 * every failure path (network error, bad JSON, bad shape, missing field)
 * resolves to a state the caller can render deterministically.
 *
 * Deterministic error behavior:
 * - Network/availability error: returns "unavailable" with descriptive reason.
 *   Caller must render as "status unknown" rather than assuming normal.
 * - Malformed JSON or bad shape: returns "malformed" with reason. UI shows
 *   "status unknown" and does NOT default to assuming normal.
 * - Valid parse but stale (older than MAINTENANCE_STATUS_MAX_AGE_MS): returns
 *   "stale" with the parsed data and age. Caller can choose to render with a
 *   "may not be current" caveat or treat as unavailable.
 * - Valid and fresh: returns "valid" with the data. Caller can trust phase
 *   and affected-capabilities to make decisions (e.g., disabling write buttons).
 */
export async function fetchMaintenanceStatus(
  signal?: AbortSignal,
): Promise<MaintenanceStatusState> {
  let raw: unknown;
  try {
    raw = await apiClient<unknown>({
      path: "/status/drain",
      method: "GET",
      signal,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.message
        ? err.message
        : "Could not reach the maintenance status endpoint.";
    return { status: "unavailable", reason };
  }

  const document = parseDocument(raw);
  if (!document) {
    return {
      status: "malformed",
      reason: "The maintenance status document is not well-formed.",
    };
  }

  const ageMs = Date.now() - new Date(document.timestamp).getTime();
  if (ageMs > MAINTENANCE_STATUS_MAX_AGE_MS) {
    return { status: "stale", data: document, ageMs };
  }

  return { status: "valid", data: document };
}

/**
 * Whether a maintenance/drain state should block write-triggering actions.
 * Returns true if writes are currently unavailable (any phase other than
 * "normal") or if we're uncertain about the state (unavailable, malformed,
 * or stale status).
 *
 * This is conservative: when in doubt, block writes. Only "valid + phase
 * normal" means writes are safe.
 */
export function shouldBlockWrites(state: MaintenanceStatusState): boolean {
  // Unavailable or malformed: block writes (fail safe)
  if (state.status === "unavailable" || state.status === "malformed") {
    return true;
  }

  // Stale: block writes (fail safe; data may be outdated)
  if (state.status === "stale") {
    return state.data.phase !== "normal";
  }

  // Valid: block writes if phase is not "normal"
  return state.status === "valid" && state.data.phase !== "normal";
}

/**
 * Whether a specific capability is currently affected (blocked) by the
 * maintenance/drain operation. Only meaningful when status is "valid";
 * during other states (unavailable, malformed, stale), returns true
 * (fail-safe: assume capability is blocked).
 *
 * Example: isCapabilityBlocked(state, "proofs:create")
 */
export function isCapabilityBlocked(
  state: MaintenanceStatusState,
  capabilityName: string,
): boolean {
  if (state.status !== "valid") {
    return true; // Fail safe: assume blocked
  }
  return state.data.affectedCapabilities.includes(capabilityName);
}

/**
 * Extract the estimated completion time if present and credible. Returns null
 * if absent, malformed, or the state is not "valid".
 *
 * Critical rule (from #295 acceptance criteria): only return an estimate when
 * the server response itself includes one. Never compute, guess, or provide a
 * default. If no estimate exists, return null; the UI must then show "unknown".
 */
export function getEstimatedCompletion(state: MaintenanceStatusState): string | null {
  if (state.status !== "valid") {
    return null;
  }
  return state.data.estimatedCompletionAt ?? null;
}

/**
 * The user-facing message describing current maintenance phase. Tailored for
 * each phase to communicate what's happening and what the user should expect.
 */
export function getPhaseDescription(phase: MaintenancePhase): string {
  switch (phase) {
    case "normal":
      return "All systems operational";
    case "draining":
      return "Deployment in progress; writes are being paused";
    case "drained":
      return "System is temporarily locked for deployment";
    case "recovering":
      return "Restoring write availability after deployment";
  }
}
