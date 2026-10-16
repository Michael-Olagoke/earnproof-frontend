# Revocation Checkpoint Inspection and Freshness UI - Design Specification

## Issue Reference
- **Issue**: #293
- **Branch**: feat/add-revocation-checkpoint-inspection-and-freshness-ui
- **Feature**: Add checkpoint inspection and freshness comparison UI to verification results

## Overview

A revocation checkpoint is a Merkle-style root/sequence used to prove a credential wasn't revoked as of some point in time. This feature adds inspection and freshness UI for that checkpoint as **purely supplementary, human-readable context**. 

**CRITICAL CONSTRAINT**: Checkpoint freshness must **NEVER** override, hide, or soften the underlying proof-validity result. The original cryptographic verification result (valid/invalid) stands on its own.

---

## 1. Checkpoint Data Structure

### CheckpointData Type
```typescript
type CheckpointData = {
  sequence: number;              // Merkle tree sequence number
  root: string;                  // Merkle root hash (hex-encoded)
  algorithm: string;             // E.g., "SHA-256", "KECCAK-256"
  ledger: string;                // Chain ledger/block identifier
  observedAt: string;            // ISO 8601 timestamp when checkpoint was fetched/recorded
};
```

### Source of Checkpoint Data
- Embedded in verification result API response (to be added to `VerifyProofResponse`)
- Represents the checkpoint that backed the proof's revocation check at verification time

---

## 2. Freshness States

A checkpoint freshness comparison yields **three distinct, mutually-exclusive states**:

### State: FRESH
- **Condition**: Checkpoint sequence/root in verification result **exactly matches** current live contract state checkpoint
- **Meaning**: Revocation data is current; contract has not advanced
- **Visual**: Success badge (emerald/green), neutral label "Fresh"
- **User Action**: None required; informational only

### State: STALE
- **Condition**: Checkpoint sequence in verification result is **less than** current live contract state checkpoint
- **Meaning**: Contract has advanced since verification; revocation data is outdated
- **Visual**: **PROMINENT WARNING** (rose/red, larger icon, bold text) - cannot be missed by casual reading
- **Label**: "Stale — Contract has advanced"
- **Additional Info**: Display both old and new sequence numbers, calculate how many sequences behind
- **User Action**: Can trigger refresh to re-compare against latest state

### State: COMPARISON_FAILED
- **Condition**: Live contract state fetch failed, or checkpoint comparison is not possible (e.g., unsupported algorithm, missing data, fetch error, authorization denied)
- **Meaning**: Cannot determine freshness; treated as its own distinct error state
- **Visual**: Warning badge (amber/yellow), label "Comparison unavailable"
- **Details**: Show reason (fetch error, unsupported algorithm, unauthorized, etc.)
- **User Action**: Can trigger refresh to retry; does not affect proof validity interpretation
- **Isolation**: **Explicitly NOT** merged into "stale" state

---

## 3. Boundary Conditions (Deterministic Behavior)

### Exact Sequence Match (Boundary: Fresh)
- **Rule**: `proofCheckpoint.sequence === liveCheckpoint.sequence` → **FRESH**
- **Rationale**: Exact match means contract state hasn't advanced since proof's checkpoint

### Sequence One Behind (Boundary: Stale)
- **Rule**: `proofCheckpoint.sequence === (liveCheckpoint.sequence - 1)` → **STALE**
- **Rationale**: One sequence difference still means contract advanced; mark as stale

### Any Further Behind
- **Rule**: `proofCheckpoint.sequence < (liveCheckpoint.sequence - 1)` → **STALE**
- **Rationale**: Any gap means stale; treat all as same STALE state (no distinction by degree)

---

## 4. Failure Modes (Explicit, Deterministic Handling)

### 4a. Checkpoint Fetch Failure
- **Trigger**: Network error, timeout, or 5xx on live contract state endpoint
- **Handling**: Move to COMPARISON_FAILED state
- **Display**: "Comparison unavailable — Unable to fetch current contract state"
- **Error Details**: Show brief error reason (not full stack trace)
- **Retry**: Refresh button available; debounced to prevent request storms

### 4b. Unsupported Algorithm
- **Trigger**: Live contract checkpoint uses algorithm not in checkpoint comparison logic
- **Handling**: Move to COMPARISON_FAILED state
- **Display**: "Comparison unavailable — Algorithm not supported"
- **Retry**: Refresh available; may succeed if live state has changed to supported algorithm

### 4c. Authorization Denied
- **Trigger**: 401/403 response when fetching live contract checkpoint
- **Handling**: Move to COMPARISON_FAILED state
- **Display**: "Comparison unavailable — Insufficient permissions"
- **Isolation**: Does not affect proof validity display; checkpoint inspection is supplementary
- **Retry**: Not recommended; same auth error will recur on refresh

### 4d. Missing/Malformed Data
- **Trigger**: Live contract response missing required checkpoint fields or invalid structure
- **Handling**: Move to COMPARISON_FAILED state
- **Display**: "Comparison unavailable — Invalid response format"
- **Retry**: Refresh available

### 4e. Checkpoint Not Present in Proof
- **Trigger**: Proof verification result has no checkpoint data (older proof format)
- **Handling**: Show graceful message "Checkpoint data not available for this proof"
- **Display**: No freshness comparison; display-only panel shows "No checkpoint data"
- **No Refresh**: Refresh unavailable since source proof doesn't have checkpoint

---

## 5. Replay and Concurrent Refresh Handling

### Rapid Refresh Clicks (Replay Prevention)
- **Rule**: Debounce refresh action to prevent overlapping requests
- **Debounce Window**: 500ms (standard pattern for user actions)
- **Behavior**: If refresh clicked twice within 500ms, second click is ignored
- **Display**: Refresh button disabled during in-flight fetch
- **Result**: Only the latest fetch result is rendered; earlier in-flight results are discarded

### Concurrent In-Flight Requests
- **Rule**: Use AbortController to cancel previous in-flight fetch on new refresh
- **Behavior**: If user clicks refresh while previous refresh is pending, abort previous request
- **Result**: Prevents stale-response race condition; latest fetch always wins
- **Display**: Single "Refreshing..." state; no duplicate spinners

### Replayed Result (Server Idempotence)
- **Rule**: If refresh returns identical checkpoint as previous fetch, display FRESH (no change)
- **Display**: No flicker; smoothly transition or remain in current state

---

## 6. Authorization and Access Control

### Who Can View Checkpoint Inspection
- **Current Assumption**: Visible to the same audience as verification results
  - Public proof verification: visible to anyone with proof ID
  - Authenticated verification: match existing token/role visibility
- **To Confirm**: Check `verifyProof` endpoint's auth requirements and role-based visibility rules
- **Implementation**: Include auth token in live checkpoint fetch if user is authenticated

### Enforcement
- **On Component Mount**: Check if current viewer is authorized
- **On Refresh**: Re-validate authorization before fetching live state
- **Behavior on Unauthorized**: Move to COMPARISON_FAILED state with "Insufficient permissions" message
- **Security**: Never show raw 401/403 error details; use generic message

---

## 7. Checkpoint Display (View-Only Panel)

### Fields Displayed (Exactly As Sourced)
1. **Sequence**: Numeric sequence number from checkpoint.sequence
2. **Root**: Hash value (truncated display with expand/copy)
3. **Algorithm**: E.g., "SHA-256" (display as-is from checkpoint.algorithm)
4. **Ledger**: Chain identifier from checkpoint.ledger
5. **Observed Time**: ISO 8601 timestamp from checkpoint.observedAt, human-formatted

### Hash Truncation
- **Display**: First 16 chars + "..." + last 8 chars (e.g., `a1b2c3d4e5f6g7h8...i9j0k1l2m3n4`)
- **Full Value Access**: Click-to-expand button shows full hash
- **Copy Action**: Copy full hash to clipboard with visual feedback (tooltip "Copied!")
- **Consistency**: Match existing hash display patterns in app (wallet hash, credential hash)

### Layout
- **Mobile**: Single column, stacked fields
- **Desktop**: 2-column grid where appropriate
- **Print**: Include checkpoint data in printable summary
- **Status**: Always read-only; no inline editing

---

## 8. Freshness Comparison Panel Layout

### Component Structure
```
┌─────────────────────────────────────────────┐
│ Revocation Checkpoint Freshness             │
├─────────────────────────────────────────────┤
│ [FRESH | STALE | COMPARISON_FAILED badge]  │
│                                             │
│ Proof Checkpoint:                          │
│  Sequence: 42                              │
│  Root: a1b2c3d4...i9j0k1l2                │
│                                             │
│ Current Contract State:                    │
│  Sequence: 42                              │
│  Root: a1b2c3d4...i9j0k1l2                │
│  (shows "Matching" or "Behind by 3")       │
│                                             │
│ [Refresh] [Loading state during fetch]    │
└─────────────────────────────────────────────┘
```

### Stale-Marking Prominence
- **Badge**: Rose/red background, bold uppercase "STALE"
- **Icon**: Exclamation or warning icon (⚠️) beside badge
- **Message**: Bold text "Contract has advanced" in sentence-case below badge
- **Comparison**: Show "Proof checkpoint sequence: 40, Current sequence: 43" in emphasized layout
- **Design Goal**: Cannot be missed by casual reading of the page

### FRESH / COMPARISON_FAILED Styling
- **FRESH**: Emerald/green, checkmark icon, "Fresh" label
- **COMPARISON_FAILED**: Amber/yellow, question mark icon, "Comparison unavailable" label

### Refresh Button
- **Label**: "Refresh"
- **Disabled State**: Disabled during in-flight fetch
- **Loading State**: Show spinner, label changes to "Checking..."
- **Debounce**: Rapid clicks ignored during 500ms debounce window
- **Error Handling**: Re-enabled on fetch failure; retry available

---

## 9. Proof Validity Independence Guarantee

### Constraint (Acceptance Criterion)
Checkpoint freshness state must **NEVER** be presented or implemented as if it replaces the authoritative proof-validity check.

### Implementation Rules
1. **Proof validity renders independently**
   - Invalid proof still renders as invalid regardless of checkpoint freshness
   - Valid proof still renders as valid even if checkpoint is stale
   - Checkpoint UI is **always supplementary**, never substitutional

2. **No Code Paths Allow Override**
   - Checkpoint state never hides, softens, or demotes proof validity badge
   - No conditional rendering that skips validity display based on checkpoint state
   - No copy implying "stale checkpoint = proof less trustworthy"

3. **Copy and UI Language**
   - Checkpoint UI says "Contract has advanced since verification"
   - NOT "Proof may be invalid" or "Trust reduced"
   - Proof validity message unchanged; checkpoint info layered below

4. **Test Coverage**
   - Regression test: Invalid proof + fresh checkpoint → renders invalid
   - Regression test: Valid proof + stale checkpoint → renders valid (with stale warning shown separately)
   - Regression test: Checkpoint visibility does not affect proof result display

---

## 10. API Integration Plan

### Current State
- `VerifyProofResponse` in `earnproof-api.v1.json` has no checkpoint field
- `ProofSummary` has `revokedAt` field but no checkpoint structure

### Required Changes
1. **Update OpenAPI Schema**
   - Add `Checkpoint` schema definition with: sequence, root, algorithm, ledger, observedAt
   - Add `revocationCheckpoint?: Checkpoint` field to `VerifyProofResponse`
   - Ensure backward compatibility (field optional for older proofs)

2. **Update TypeScript Types**
   - Regenerate `lib/api/generated/v1.ts` from updated schema
   - Update `lib/api/client-contracts.ts` if hand-authored types exist
   - Ensure typing supports null/undefined for backward compat

3. **Endpoint for Live Contract State**
   - To be determined: Does endpoint already exist?
   - Required: `GET /contracts/current-checkpoint` or similar
   - Response: `{ sequence, root, algorithm, ledger, observedAt }`
   - Auth: Must support optional Bearer token; 401/403 if unauthorized

---

## 11. Component Architecture

### New Components
1. **CheckpointInspectionPanel** (`components/verification/checkpoint-inspection-panel.tsx`)
   - Display checkpoint data fields
   - Hash truncation + expand/copy
   - Read-only, view-for-display only

2. **CheckpointFreshnessPanel** (`components/verification/checkpoint-freshness-panel.tsx`)
   - Compare proof checkpoint vs live contract state
   - Render FRESH / STALE / COMPARISON_FAILED states
   - Refresh button with debounce + loading state
   - Prominent stale-marking

3. **Checkpoint Utilities** (`lib/credentials/checkpoint-verification.ts`)
   - Type definitions (CheckpointData, FreshnessState, etc.)
   - `compareCheckpoints(proof, live) → FreshnessResult`
   - Error handling and normalization

### Integration Points
- `app/verify/[proofId]/page.tsx`: Include checkpoint panels in result display
- `components/verification/verification-panel.tsx`: Include panels in generic verification result rendering
- `lib/api/verify-proof.ts`: Extend to include checkpoint fetching logic

---

## 12. Testing Strategy

### Fixtures (Synthetic, No Real Data)
- `lib/credentials/__fixtures__/checkpoints.ts`
- Fixture sets: Fresh, Stale (1 behind, 5 behind), ComparisonFailed, MissingData

### Unit Tests
- `lib/credentials/__tests__/checkpoint-verification.test.ts`
  - `compareCheckpoints()` with all boundary conditions
  - Fresh, stale, comparison-failed scenarios
  - Algorithm mismatch, missing data handling

### Component Tests
- `components/verification/__tests__/checkpoint-inspection-panel.test.tsx`
  - Field rendering, hash truncation/expand, copy action
  
- `components/verification/__tests__/checkpoint-freshness-panel.test.tsx`
  - Three freshness states (FRESH, STALE, COMPARISON_FAILED)
  - Stale badge prominence, visual marking
  - Refresh action, debounce, loading state
  - Authorization failure handling

### Regression Tests
- Invalid proof + fresh checkpoint → invalid badge rendered, checkpoint shown separately
- Valid proof + stale checkpoint → valid badge rendered, stale warning shown alongside (not instead of)
- Checkpoint state never hides or softens proof validity

### Concurrency Tests
- Rapid refresh clicks → only latest result rendered
- In-flight fetch cancel on new refresh → no stale-response render

### Boundary Tests
- Sequence exact match → FRESH
- Sequence exactly 1 behind → STALE
- Sequence 5+ behind → STALE (same as 1 behind)

### Authorization Tests
- Authorized user → checkpoint fetched, comparison shown
- Unauthorized user → COMPARISON_FAILED state, generic message
- No token provided → checkpoint fetched if endpoint allows public access

---

## 13. Backward Compatibility and Migration

### For Older Proofs Without Checkpoint Data
- **Rendering**: Show "Checkpoint data not available" message
- **No Comparison**: Refresh action not offered
- **Proof Validity**: Unaffected; renders as always

### For Mixed New/Old Checkpoints
- **Algorithm Change**: If live state uses new algorithm, comparison-failed (not merged into stale)
- **Version Migration**: Handle gracefully; document exact version boundaries if needed

---

## 14. Acceptance Criteria Checklist

- [ ] Checkpoint data displayed: sequence, root, algorithm, ledger, observed time
- [ ] Comparison UI shows: proof checkpoint vs current live contract state
- [ ] Three freshness states distinct and well-defined: FRESH, STALE, COMPARISON_FAILED
- [ ] Stale checkpoint **prominently** marked (not easily missed)
- [ ] Refresh action re-fetches and re-compares on demand
- [ ] Refresh debounced/disabled to prevent overlapping requests
- [ ] All deterministic behaviors documented and implemented
- [ ] Authorization checked; unauthorized access handled gracefully
- [ ] Checkpoint freshness **NEVER** overrides proof validity result
- [ ] Proof validity still renders as invalid/valid regardless of checkpoint
- [ ] No copy implies checkpoint state affects proof trustworthiness
- [ ] Comprehensive tests for all scenarios, boundary conditions, regression
- [ ] All validation commands pass: lint, test, build
- [ ] PR description includes spec, stale-marking strategy, proof-validity guarantee, test output

---

## 15. Deliverables (Per Task List)

1. ✅ Research & OpenAPI schema examination
2. ✅ Deterministic behavior specification (this document)
3. Checkpoint types and utilities (lib/credentials/checkpoint-verification.ts)
4. Extend VerifyProofResponse types with checkpoint fields
5. CheckpointInspectionPanel component
6. CheckpointFreshnessPanel component with prominent stale-marking
7. API client for live checkpoint fetching
8. Integration into verification result display
9. Synthetic test fixtures
10. Component and regression test suite
11. Validation commands (lint, test, build)
12. PR with complete spec, stale-marking strategy, proof-validity guarantee, test output
