# Contract State Digest Comparison Tool - Design Document

## Overview

This document specifies the deterministic behavior, versioning approach, failure modes, and acceptance criteria for the contract state digest comparison tool (Issue #292). This tool enables operators to compare the backend's projected contract state against the live on-chain contract's digest without manual collection of hashes.

## 1. Digest Versioning

### Current Version: v1

The contract state digest is versioned to support evolution while maintaining backward compatibility. Only **v1** is currently recognized.

#### v1 Schema
```typescript
type ContractStateDigestV1 = {
  version: "v1";
  algorithm: "SHA-256"; // Only SHA-256 supported in v1
  contractAddress: string;
  network: string; // "testnet" | "public"
  asOfTimestamp: string; // ISO 8601 UTC
  components: {
    // Each component is independently verifiable
    issuerRegistryState: string; // hex digest of issuer registry
    proofCommitmentState: string; // hex digest of proof commitments
    revocationState: string; // hex digest of revocation entries
    protocolConfig: string; // hex digest of protocol configuration
  };
  aggregateDigest: string; // SHA-256 of all component digests combined
};
```

### Versioning Behavior

- **Unknown version**: Fail closed with error `UNSUPPORTED_DIGEST_VERSION`. Do not attempt comparison.
- **Future versions**: When v2+ is introduced, the tool will validate it against a registry of supported versions. Operators will be notified of required tool updates.
- **Multi-version support**: The comparison logic normalizes component names across versions if needed, documented explicitly in the comparison result.

## 2. Component-Level Comparison

Rather than a single opaque "match/mismatch" result, the digest is decomposed into constituent components. Each component is compared individually.

### Comparison Result Structure
```typescript
type ContractStateComparisonResult = {
  requestId: string; // UUID for deduplication/replay detection
  timestamp: string; // ISO 8601 UTC when comparison was performed
  network: string;
  contractAddress: string;
  digestVersion: "v1";
  componentComparisons: ComponentComparison[];
  overallStatus: "all-match" | "some-mismatch" | "error";
  mismatches: MismatchDetail[];
  freshness: FreshnessInfo;
  error?: ComparisonError;
};

type ComponentComparison = {
  name: string; // "issuerRegistryState", "proofCommitmentState", etc.
  backendDigest: string; // hex
  liveDigest: string; // hex
  status: "match" | "mismatch";
  fetchedAt: string; // ISO 8601 UTC
};

type MismatchDetail = {
  component: string;
  backendDigest: string;
  liveDigest: string;
  reason?: string; // e.g., "data freshness difference", "backend projection lag"
};

type FreshnessInfo = {
  backendProjectionAsOf: string; // ISO 8601 UTC
  backendProjectionAge: number; // milliseconds
  liveDigestFetchedAt: string; // ISO 8601 UTC
  liveDigestAge: number; // milliseconds
  isBackendStale: boolean; // true if > BACKEND_STALENESS_THRESHOLD_MS
  isLiveDigestStale: boolean; // true if > LIVE_DIGEST_STALENESS_THRESHOLD_MS
};
```

### Staleness Thresholds

- **Backend Projection**: Considered stale if > **60 seconds** old
- **Live Digest**: Considered stale if > **30 seconds** old

Rationale: Backend projection age is reported by the backend and may reflect internal processing delays. Live digest fetches are network operations and should be fresher.

## 3. Freshness Tracking

The tool surfaces timestamps and age information for both the backend projection and the live digest fetch, allowing operators to judge whether a mismatch is timing-related or a real divergence.

### Freshness Display Rules

1. **Both fresh**: Display comparison normally; mismatches indicate real state divergence.
2. **Backend stale, live fresh**: Warn operator that the backend's view is outdated; a mismatch may resolve when backend projection is refreshed.
3. **Live stale, backend fresh**: Warn operator that the digest fetch is aged; recommend re-fetching live digest.
4. **Both stale**: Warn operator; recommend refreshing both before relying on the comparison.

### Exact Boundary Behavior

- Data at exactly the staleness threshold (e.g., 60.000 seconds old) is considered **not stale**.
- Data one millisecond over the threshold (60.001 seconds) is considered **stale**.
- Timestamps are compared using millisecond precision; no rounding.

## 4. Authorization

Only operators with the **ADMIN** or **ISSUER** role are permitted to run the comparison.

### Authorization Check
- Occurs **before any data fetch** (network requests)
- Checked in the component using `session?.user.role`
- Roles defined as: `"WORKER" | "ISSUER" | "ADMIN" | "DEVELOPER"`
- Allowed roles: `"ADMIN"` or `"ISSUER"`
- Unauthorized access renders an access-denied message, not hidden UI

## 5. Network and Contract Selection

### Network Selection
- Operator selects from available networks: `"testnet"` | `"public"`
- Selection stored in component state, validated before fetching
- Mismatch between selected network and backend projection network is an error condition (fail closed)

### Contract Selection
- Operator selects from a list of known contracts (fetched from backend projection metadata)
- Contract identity includes: `contractAddress` + `network`
- Mismatch between selected contract and backend projection target is an error condition (fail closed, see Validation & Conflicts)

## 6. Validation & Conflict Detection

### Contract Identity Mismatch (Fail Closed)
If the operator selects contract `"GCDE..F"` on testnet but the backend projection is reporting state for contract `"GABC..D"` on testnet:
- **Error**: `CONTRACT_IDENTITY_MISMATCH`
- **Message**: "Selected contract does not match backend projection target. Backend is tracking {backendContract}. Please verify network and contract selection."
- **Action**: Comparison is not performed. Operator must correct selection and retry.

### Network Mismatch (Fail Closed)
If the operator selects testnet but the backend is reporting state for the public network:
- **Error**: `NETWORK_MISMATCH`
- **Message**: "Selected network does not match backend projection. Backend is tracking public network."
- **Action**: Comparison is not performed. Operator must correct selection and retry.

### Digest Fetch Failure
If the live on-chain digest fetch fails (network error, Horizon timeout, contract not found):
- **Error**: `DIGEST_FETCH_FAILED`
- **Details**: Include HTTP status code, timeout duration, and recovery guidance
- **Action**: Comparison is not performed. Operator may retry or investigate network connectivity.

### Backend Projection Fetch Failure
If the backend projection API returns an error or is unreachable:
- **Error**: `BACKEND_PROJECTION_FETCH_FAILED`
- **Details**: Include HTTP status code and API error message
- **Action**: Comparison is not performed. Operator may retry.

## 7. Duplicate/Replay Detection

A replayed comparison request (same operator, same network, same contract, within a short window) should produce the same result without creating duplicate entries or triggering duplicate backend side effects.

### Replay Prevention
- Each comparison is assigned a unique `requestId` (UUID v4) at the time of request
- Request is idempotent: re-submitting with the same parameters produces the same result
- No backend state (e.g., audit log entries, comparison records) is created client-side; results are ephemeral
- If an operator clicks "compare" twice in rapid succession (< 1 second):
  - First request proceeds normally
  - Second request is queued/debounced and uses the first request's result
  - No duplicate API calls are made

### Implementation
- Component maintains a "last comparison" cache with timestamp and result
- If a new comparison request matches the cache (same network, contract, digest version) and cache is < 5 seconds old, return cached result with indicator
- Request counter ensures out-of-order responses don't overwrite newer data

## 8. Mismatch Export

When mismatches are detected, the operator can export the comparison for offline review.

### Export Formats

#### JSON Format
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-10-16T14:30:00Z",
  "network": "testnet",
  "contractAddress": "GBDE4723EB188743EA6FA31B25670131D592375F35E7997F19A8FB0F635CFFC7C",
  "digestVersion": "v1",
  "componentComparisons": [
    {
      "name": "issuerRegistryState",
      "backendDigest": "aabbccdd...",
      "liveDigest": "eeff0011...",
      "status": "mismatch",
      "fetchedAt": "2026-10-16T14:29:55Z"
    }
  ],
  "freshness": {
    "backendProjectionAsOf": "2026-10-16T14:28:00Z",
    "backendProjectionAge": 60000,
    "liveDigestFetchedAt": "2026-10-16T14:29:55Z",
    "liveDigestAge": 5000,
    "isBackendStale": true,
    "isLiveDigestStale": false
  }
}
```

#### CSV Format
```
Component,Backend Digest,Live Digest,Status,Fetched At
issuerRegistryState,aabbccdd...,eeff0011...,mismatch,2026-10-16T14:29:55Z
proofCommitmentState,11223344...,11223344...,match,2026-10-16T14:29:55Z
```

### Export Security
- Exported data includes **only** non-sensitive comparison results
- **Never** includes wallet addresses, private proof material, raw credentials, or secrets
- Timestamp and digest values are included (these are derived, not sensitive)
- File is downloaded to user's local machine; no server-side persistence of exports

## 9. Concurrency & Race Conditions

### Rapid Re-trigger (< 1 second apart)
- Request 1: Submitted, awaits backend projection fetch
- Request 2: Submitted while Request 1 is in-flight
- Behavior: Request 2 is debounced and uses Request 1's result
- UI: Loading state persists; no duplicate spinners or results

### Request Counter Pattern
```typescript
let requestCounter = 0;

async function compareDigests() {
  const thisRequestId = ++requestCounter;
  // fetch and compute
  // Only update UI if thisRequestId === requestCounter
}
```

### State Update Guard
- Only the most recent request's result is rendered
- Earlier responses are ignored (out-of-order protection)
- Prevents flickering or inconsistent state

## 10. Comprehensive Acceptance Criteria

### Positive Cases
- ✓ All components match: Result shows "all-match" status with all component comparisons marked "match"
- ✓ Single component mismatch: Only the mismatched component is flagged; others show "match"
- ✓ Multiple component mismatches: All mismatched components are listed; matched components are shown but not highlighted
- ✓ Freshness display: Backend and live digest ages are shown; staleness warnings appear when thresholds exceeded

### Negative Cases
- ✓ Unknown digest version: Error returned with code `UNSUPPORTED_DIGEST_VERSION`; no comparison attempted
- ✓ Contract identity mismatch: Error with code `CONTRACT_IDENTITY_MISMATCH`; operator is guided to correct selection
- ✓ Network mismatch: Error with code `NETWORK_MISMATCH`; clear message on discrepancy
- ✓ Backend fetch failure: Error with code `BACKEND_PROJECTION_FETCH_FAILED`; HTTP status and details included
- ✓ Live digest fetch failure: Error with code `DIGEST_FETCH_FAILED`; recovery guidance provided
- ✓ Unauthorized access: Access-denied message shown; no data fetched; not hidden in UI

### Authorization
- ✓ ADMIN role: Can run comparison
- ✓ ISSUER role: Can run comparison
- ✓ WORKER role: Access denied
- ✓ DEVELOPER role: Access denied (only data reads, not reconciliation operations)

### Concurrency
- ✓ Two rapid requests (< 1 second apart): Debounced; only one network request; same result returned to both
- ✓ Request order: Out-of-order responses do not overwrite newer results (request counter guards this)

### Boundary Conditions
- ✓ Data exactly at staleness threshold (e.g., 60.000s): Not marked stale
- ✓ Data 1ms over threshold (60.001s): Marked stale; warning shown
- ✓ Both sides stale: Both warnings shown; operator guided to refresh

### Replay & Idempotency
- ✓ Same network, contract, digest version requested twice within 5 seconds: Cached result returned; no duplicate API calls
- ✓ Replayed request after 5+ seconds: Fresh comparison performed
- ✓ Exported mismatches: File contains correct data; no duplicates

### Regression
- ✓ Existing reconciliation functionality (if any) in `app/settings` unchanged
- ✓ No breaking changes to `lib/api` or sibling settings pages

## 11. Error Catalog

| Code | Description | Recovery |
|------|-------------|----------|
| `UNSUPPORTED_DIGEST_VERSION` | Digest version not recognized | Contact support; may need tool update |
| `CONTRACT_IDENTITY_MISMATCH` | Selected contract ≠ backend target | Verify network and contract selection |
| `NETWORK_MISMATCH` | Selected network ≠ backend network | Verify network selection |
| `DIGEST_FETCH_FAILED` | Live digest fetch failed | Retry; check network connectivity and contract existence |
| `BACKEND_PROJECTION_FETCH_FAILED` | Backend API error | Retry; check API availability |
| `AUTHORIZATION_DENIED` | User role insufficient | Contact operator to request ADMIN/ISSUER role |

## 12. Implementation Patterns (Reuse Existing Conventions)

### API Client Pattern
- Use `retryRead()` for GET operations (automatic retry on 429, 503, 504, network errors)
- Bearer token authentication via `bearer(token)` helper
- Type all responses with generics: `apiClient<T>()`

### Validation Pattern
- Zod schemas for input validation (network selection, contract identity)
- Custom validators for domain logic (contract address format validation)
- Validators in `lib/validation/reconciliation.ts`

### Component Structure
- Main component: `ReconciliationDigestComparison` in `components/reconciliation/`
- Child components: `NetworkContractSelector`, `ComparisonResults`, `MismatchExport`
- React state for data, errors, pagination/cursoring if needed
- Abort controller pattern for canceling in-flight requests

### Test Fixtures
- Synthetic fixtures in `tests/fixtures/reconciliation-fixtures.ts`
- No real wallet material, credentials, or secrets
- Fixed IDs, deterministic timestamps (ISO strings, never `Date.now()`)
- Pre-built fixture sets: `MOCK_CONTRACT_STATE_DIGEST_V1`, `MOCK_BACKEND_PROJECTION`, etc.

### Error Handling
- Normalize errors via `normalizeError()` from `lib/api/error-normalization.ts`
- Field-level errors extracted for validation feedback
- API conflict errors handled for stale-write scenarios

---

**Document Version**: 1.0  
**Last Updated**: 2026-10-16  
**Author**: Kiro (AI-powered agent)  
**Related Issue**: #292
