# Pull Request: Contract State Digest Comparison Tool

## Title
`feat(frontend): build contract state digest comparison tool`

## Description

### Overview
Implemented a complete contract state digest comparison tool enabling operators to compare the backend's projected contract state against the live on-chain digest without manual hash collection. The tool provides component-level breakdown, freshness tracking, error detection, and export capabilities for offline review.

**Closes**: #292

### Problem Statement
Operators previously had no way to compare the backend's projected contract state against the live on-chain contract's digest without manually collecting and comparing hashes by hand. This tool automates that workflow.

### Solution
- **Network & Contract Selection**: Operators select the network (testnet/public) and contract to reconcile
- **Component-Level Comparison**: Digest decomposed into 4 meaningful components, each compared individually
- **Freshness Tracking**: Backend projection age (60s threshold) and live fetch age (30s threshold) displayed
- **Error Detection**: Deterministic error handling for version mismatches, contract/network conflicts, fetch failures
- **Mismatch Export**: JSON/CSV export for offline review
- **Authorization**: ADMIN and ISSUER roles only
- **Concurrency Safety**: Request counter prevents out-of-order overwrites; 5s cache debounces rapid triggers

## Architecture & Design

### Digest Versioning
- **Current Version**: v1 only
- **Failure Mode**: Unknown versions fail closed with `UNSUPPORTED_DIGEST_VERSION` error
- **Future-Proof**: Extensible for v2+ with explicit version check

### Component Breakdown
Digest decomposed into 4 state components:
1. `issuerRegistryState` - Registry of proof issuers
2. `proofCommitmentState` - Proof commitments
3. `revocationState` - Revocation entries
4. `protocolConfig` - Protocol configuration

Each component compared individually; mismatches isolated.

### Freshness Tracking
| Data Source | Threshold | Stale Age | Boundary Behavior |
|-------------|-----------|-----------|-------------------|
| Backend Projection | 60s | > 60s | Exactly 60.000s = NOT stale; 60.001s = IS stale |
| Live Digest | 30s | > 30s | Exactly 30.000s = NOT stale; 30.001s = IS stale |

### Deterministic Error Behavior

| Error Code | Trigger | User Sees | Recovery |
|-----------|---------|-----------|----------|
| UNSUPPORTED_DIGEST_VERSION | digest.version ≠ "v1" | "Unsupported Digest Version" + details | Contact support; may need tool update |
| CONTRACT_IDENTITY_MISMATCH | selected ≠ backend contract | "Contract Mismatch" + both addresses | Verify network and contract selection |
| NETWORK_MISMATCH | selected ≠ backend network | "Network Mismatch" + both networks | Verify network selection |
| DIGEST_FETCH_FAILED | Live digest fetch fails | "Failed to Fetch Live Digest" + HTTP status | Retry; check network connectivity |
| BACKEND_PROJECTION_FETCH_FAILED | Backend API fails | "Backend Error" + API message | Retry |
| AUTHORIZATION_DENIED | User role not ADMIN/ISSUER | "Access Denied" + role guidance | Request role upgrade |

### Concurrency & Replay Handling
- **Rapid Re-trigger** (< 1 second apart): Debounced, single API call, shared result
- **Request Counter**: Guards against out-of-order response overwrites
- **Cache**: 5-second TTL for identical requests (same network, contract)
- **Fresh Comparison**: Performed after cache expires (5+ seconds)
- **Replay Idempotency**: Identical request parameters produce identical result

## Implementation Details

### Files Created (14 total)

**Design & Documentation**
1. `RECONCILIATION_DESIGN.md` - Complete specification with all acceptance criteria

**Type System**
2. `lib/reconciliation/types.ts` - Type hierarchy for digests, comparisons, errors, state
3. `lib/validation/reconciliation.ts` - Zod schemas and domain validators

**API & Logic**
4. `lib/api/reconciliation.ts` - API client (backend projection, live digest, available contracts)
5. `lib/reconciliation/comparison.ts` - Comparison logic with component breakdown and error detection

**Components**
6. `components/reconciliation/reconciliation-digest-comparison.tsx` - Main orchestration
7. `components/reconciliation/network-contract-selector.tsx` - Selection UI
8. `components/reconciliation/comparison-results.tsx` - Results display with freshness
9. `components/reconciliation/mismatch-export-section.tsx` - JSON/CSV export
10. `app/settings/reconciliation/page.tsx` - Settings page integration

**Tests & Fixtures**
11. `tests/reconciliation/comparison.test.ts` - 26 test cases
12. `tests/validation/reconciliation.test.ts` - 16 test cases
13. `tests/components/reconciliation/reconciliation-digest-comparison.test.tsx` - 18+ test cases
14. `tests/fixtures/reconciliation-fixtures.ts` - Synthetic fixtures for all scenarios

### Patterns Reused

**API Client**
- `retryRead()` for GET operations (automatic retry on 429, 503, 504)
- Bearer token authentication via `bearer(token)` helper
- Strongly typed responses with generics: `apiClient<T>()`
- Error normalization via `normalizeError()`

**Component Structure**
- React state with proper initialization
- Abort controller for canceling in-flight requests
- Request counter pattern for out-of-order guard
- Cache with TTL for debouncing
- useCallback/useMemo for performance

**Validation**
- Zod schemas for input parsing
- Custom validators for domain logic (contract address format, network consistency)
- Validators in `lib/validation/` organized by feature

**Testing**
- Jest with React Testing Library
- Synthetic fixtures (no real wallet material, secrets, or credentials)
- Fixed ISO timestamps for determinism
- Comprehensive mocking of API calls

## Test Coverage

### Total Test Count: 60+ test cases

### Comparison Logic Tests (26 cases)
**Positive Cases** (12)
- All components match
- Single component mismatch identified
- Multiple components mismatched
- Freshness tracked even when matching
- Case-insensitive digest comparison
- Unique request ID generation
- Normalized digests lowercase

**Negative Cases** (6)
- Unsupported version (v2) fails closed
- Contract identity mismatch detected
- Network mismatch detected
- All error codes return proper shape
- Comparison proceeds despite stale data

**Boundary Conditions** (8)
- Exactly 60s backend staleness: NOT stale
- 1ms over 60s: IS stale
- Exactly 30s live staleness: NOT stale
- 1ms over 30s: IS stale

### Validation Tests (16 cases)
- Contract address format (valid, invalid length, wrong prefix, empty)
- Network validation (testnet, public, invalid)
- Authorization (ADMIN, ISSUER, WORKER denied, DEVELOPER denied)
- Consistency checks (matching/mismatched networks, contracts)

### Component Tests (18+ cases)
**Authorization** (5)
- WORKER access denied
- DEVELOPER access denied
- No session denied
- ADMIN allowed
- ISSUER allowed

**Concurrency** (2)
- Rapid re-trigger debounced (single API call)
- Out-of-order responses prevented

**Replay & Idempotency** (2)
- Cache hit within 5s
- Fresh fetch after 5s+

**Error Handling** (4)
- Validation failure blocks comparison
- Backend fetch error displayed
- Network mismatch error shown
- Proper error messages rendered

## How to Verify

### Prerequisites
```bash
cd c:\Users\RAVE\Desktop\Drips\veridatum-labs\earnproof-frontend
npm install  # First time only
```

### Run Tests
```bash
# All tests
npm test

# Specific test suites
npm test -- tests/reconciliation/comparison.test.ts
npm test -- tests/validation/reconciliation.test.ts
npm test -- tests/components/reconciliation/reconciliation-digest-comparison.test.tsx

# Watch mode
npm test -- --watch
```

### Run Linter
```bash
npm run lint
```

### Build
```bash
npm run build
```

### Manual Testing
1. Navigate to `/settings/reconciliation` in the app
2. Verify access denied for WORKER/DEVELOPER roles
3. Select network (testnet) and contract
4. Click "Compare Digests"
5. View component-level results
6. Check freshness warnings if data is aged
7. Export mismatches as JSON or CSV

## Behavioral Guarantees

### Fail-Closed Design
- Unknown digest versions: error, no comparison
- Contract mismatch: error, no comparison
- Network mismatch: error, no comparison
- Unauthorized role: error, no data fetch

### Deterministic Behavior
- Same input within 5s: cached result (deterministic)
- After 5s: fresh comparison (deterministic)
- Out-of-order responses: ignored (no UI corruption)
- Stale data: comparison proceeds, warnings shown

### Security & Privacy
- Authorization before any API calls
- No raw wallet addresses in exports
- No private proof material in exports
- No secrets committed
- All test data is synthetic

## Code Quality

### No Breaking Changes
- No modifications to existing `lib/api` patterns
- No changes to sibling settings pages
- Authorization uses existing role check pattern
- Error handling follows existing normalization
- Validation uses established Zod approach

### Accessibility
- Semantic HTML (buttons, labels, inputs)
- Color not sole indicator (✓/✗ symbols included)
- Error messages clear and actionable
- Loading states visible to users

### Performance
- Request deduplication via cache
- Concurrent API fetches (Promise.all)
- Memoized selectors (useMemo, useCallback)
- Abort controller cancellation

## Documentation Included

- `RECONCILIATION_DESIGN.md` - Comprehensive design spec with all acceptance criteria
- `VALIDATION_REPORT.md` - Test coverage report and validation instructions
- Inline JSDoc comments on all functions
- Component prop documentation
- Type definitions with descriptions

## Branch Info

**Feature Branch**: `feat/build-contract-state-digest-comparison-tool`  
**Commit**: `f82ef93` (initial implementation)  
**Files Changed**: 15 files created/modified  
**Lines Added**: ~4,069  

## Acceptance Criteria Verification

✅ Network and contract selection UI  
✅ Digest versioning (v1, fail-closed on unknown)  
✅ Component-level comparison (4 components)  
✅ Freshness tracking (backend 60s, live 30s)  
✅ Boundary condition handling (exact threshold, 1ms over)  
✅ Mismatch export (JSON, CSV)  
✅ Authorization (ADMIN/ISSUER only)  
✅ Deterministic error behavior  
✅ Concurrency safety (request counter, cache)  
✅ Replay idempotency (5s cache)  
✅ Synthetic fixtures only  
✅ Comprehensive tests (60+ cases)  
✅ Design specification (RECONCILIATION_DESIGN.md)  
✅ No breaking changes  
✅ Established patterns reused  

## Reviewer Checklist

- [ ] Design document `RECONCILIATION_DESIGN.md` reviewed for accuracy
- [ ] Test coverage verified (60+ tests, all categories)
- [ ] Authorization enforcement before any API calls
- [ ] Error handling deterministic and documented
- [ ] Boundary conditions tested (exact threshold, 1ms over)
- [ ] No real wallet material or secrets in code
- [ ] API client patterns follow established conventions
- [ ] Component patterns consistent with rest of app
- [ ] Validation schemas comprehensive
- [ ] Export functionality non-sensitive (no private data)
- [ ] Concurrency handled correctly (no race conditions)
- [ ] Build succeeds without errors
- [ ] Linter passes without warnings
- [ ] All tests pass

---

**Author**: Kiro (AI-powered agent)  
**Issue**: #292  
**Date**: October 16, 2026
