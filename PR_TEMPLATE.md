# PR: Add Role-Aware Route Access and Forbidden States

Closes #139

## Summary

This PR centralizes role-based access control (RBAC) across the EarnProof frontend, ensuring navigation and route rendering stay synchronized with backend authorization requirements. It adds a new forbidden (403) page that is semantically distinct from both unauthenticated (401) and not-found (404) states.

## Problem

Before this change:
- Navigation links and direct route access could drift out of sync
- No single source of truth for route permissions
- Unauthenticated and forbidden states were not visually distinct
- Role changes mid-session didn't invalidate cached access decisions
- Nav hiding was the only UX for access control (not enforced)

## Solution

**Centralized Role Policy** (`lib/auth/capabilities.ts`):
- `ROLE_CAPABILITIES` defines which routes each role can access
- Single source of truth: all access decisions flow through `canAccessRoute()`
- Role hierarchy: worker → issuer → developer → admin with appropriate escalation

**Route Guards** (`lib/auth/middleware.ts`):
- `checkRouteAccess()` returns 'allowed' | 'forbidden' | 'unauthorized'
- `hasAuthorizationChanged()` detects role changes mid-session
- `syncRoleChange()` atomically updates role, invalidating cached decisions

**Role-Aware Navigation** (`components/layout/public-nav.tsx`):
- Reads user role from session storage
- Filters nav items: public routes always visible, protected routes per role
- Gracefully handles storage errors
- Works for both desktop and mobile navigation

**Forbidden Page** (`app/forbidden.tsx`):
- Distinct from 404 (shows "403_FORBIDDEN", title "Access denied")
- Distinct from 401 (user is authenticated, not redirected to login)
- Stable test identifier: `data-testid="forbidden-page"`
- Provides recovery actions and clear messaging

## Role Hierarchy

```
worker    → /proofs, /settings
issuer    → /proofs, /settings, /settings/organizations, /settings/issuers
developer → /proofs, /settings, /developers, /developers/api-keys
admin     → all routes
```

## Changes

### Modified Files
- `lib/storage/index.ts` - Added `walletHash` and `role` fields to session schema
- `components/layout/public-nav.tsx` - Role-aware navigation filtering

### New Files
- `lib/auth/capabilities.ts` - Role definitions and capability checks
- `lib/auth/capabilities.test.ts` - 40+ test cases for role policy
- `lib/auth/middleware.ts` - Route guard utilities
- `lib/auth/middleware.test.ts` - 30+ test cases for guards
- `lib/auth/integration.test.ts` - 20+ integration tests (positive, negative, boundary, regression)
- `app/forbidden.tsx` - 403 Forbidden page component
- `app/forbidden.test.tsx` - Forbidden page tests
- `components/layout/__tests__/public-nav.test.tsx` - Nav filtering tests

## Test Coverage

**Positive Cases:** Each role can access its permitted routes
- Worker: /proofs, /settings ✅
- Issuer: +/settings/organizations, /settings/issuers ✅
- Developer: +/developers, /developers/api-keys ✅
- Admin: all routes ✅

**Negative Cases:** Each role is blocked from unauthorized routes
- Worker blocked from /developers ✅
- Issuer blocked from /developers ✅
- Developer blocked from /settings/issuers ✅

**Boundary Cases:** Role changes invalidate cached decisions
- Worker → Developer upgrade grants access ✅
- Admin → Developer downgrade revokes access ✅
- Multiple role transitions handled correctly ✅

**Regression Cases:** 403 vs 401 vs 404 distinction maintained
- 403 Forbidden: authenticated, no access ✅
- 401 Unauthorized: not authenticated ✅
- 404 Not Found: route doesn't exist ✅
- Each renders correct page/redirect ✅

**Total: 100+ test cases, all passing**

## Security Considerations

- ✅ Backend authorization remains the actual security boundary
- ✅ Nav hiding is UX only, not security enforcement
- ✅ Direct URL navigation is checked before render (no data leakage)
- ✅ Role information taken from authenticated session context
- ✅ Session includes token requirement for API calls
- ✅ No stale cached decisions after role changes

## Accessibility

- ✅ Forbidden page has proper heading hierarchy
- ✅ Links keyboard navigable with visible focus styles
- ✅ ARIA attributes on navigation
- ✅ Color contrast meets WCAG standards
- ✅ Mobile nav accessibility preserved

## Backward Compatibility

- ✅ Storage migration handles legacy session format
- ✅ Null/missing roles treated as unauthenticated
- ✅ Existing routes still work (no breaking changes)
- ✅ CreateProofFlow continues to work unchanged

## Manual Verification

See `VERIFICATION_CHECKLIST.md` for comprehensive manual testing guide:

1. **Route Access Control** - Test canAccessRoute() per role
2. **Navigation Filtering** - Verify nav items shown/hidden correctly
3. **Forbidden Page** - Confirm 403 displays when appropriate
4. **Role Change Handling** - Verify cached decisions invalidate
5. **403 vs 401 vs 404** - Confirm each state is distinct
6. **Edge Cases** - Test invalid roles, storage errors, nested routes
7. **Regression** - Verify existing features still work

## Implementation Notes

- No new dependencies added
- Uses existing session storage infrastructure
- Compatible with Stellar Freighter wallet flow
- Follows existing code style and patterns
- All TypeScript types exported properly

## Deployment Considerations

- No data migrations needed
- No backend changes required
- Feature can be rolled out gradually
- No performance impact (memoized filters)
- Backward compatible with old session format

---

## Reviewers Checklist

- [ ] Code follows project style and conventions
- [ ] All 100+ tests passing
- [ ] TypeScript types correct and exported
- [ ] No ESLint violations
- [ ] Accessibility requirements met
- [ ] Security boundary verified (backend enforces)
- [ ] Manual verification complete
- [ ] PR description complete and clear

---

**Related:** #139
**Type:** Feature / Authorization
**Size:** Medium (11 files)
