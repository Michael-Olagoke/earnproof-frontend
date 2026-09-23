/**
 * Integration tests for role-aware route access and forbidden states
 *
 * These tests verify the end-to-end behavior of:
 * - Access control decisions based on role
 * - Forbidden vs. unauthorized distinction
 * - Role changes invalidating cached decisions
 * - Navigation visibility matching backend authorization
 */

import {
  canAccessRoute,
  getAccessState,
  PROTECTED_ROUTES,
  type UserRole,
} from '@/lib/auth/capabilities';
import {
  checkRouteAccess,
  getSessionRole,
  hasAuthorizationChanged,
  isProtectedRoute,
  shouldShowForbidden,
  syncRoleChange,
  type SessionContext,
} from '@/lib/auth/middleware';

describe('role-aware route access integration', () => {
  describe('positive: each role can access permitted routes', () => {
    it('worker can access worker-permitted routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      expect(checkRouteAccess(session, PROTECTED_ROUTES.PROOFS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS).isAllowed).toBe(true);

      // Worker can access nested routes
      expect(checkRouteAccess(session, '/proofs/minimum-income').isAllowed).toBe(true);
      expect(checkRouteAccess(session, '/settings/account').isAllowed).toBe(true);
    });

    it('issuer can access issuer-permitted routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'issuer-1',
          walletAddress: 'GISSUER',
          walletHash: 'hash2',
          role: 'issuer',
        },
      };

      expect(checkRouteAccess(session, PROTECTED_ROUTES.PROOFS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS).isAllowed)
        .toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ISSUERS).isAllowed).toBe(true);
    });

    it('developer can access developer-permitted routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'dev-1',
          walletAddress: 'GDEV',
          walletHash: 'hash3',
          role: 'developer',
        },
      };

      expect(checkRouteAccess(session, PROTECTED_ROUTES.PROOFS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS_API_KEYS).isAllowed).toBe(
        true,
      );
    });

    it('admin can access all routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'admin-1',
          walletAddress: 'GADMIN',
          walletHash: 'hash4',
          role: 'admin',
        },
      };

      Object.values(PROTECTED_ROUTES).forEach((route) => {
        expect(checkRouteAccess(session, route).isAllowed).toBe(true);
      });
    });
  });

  describe('negative: each role is blocked from unauthorized routes', () => {
    it('worker is denied access to developer routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      const result = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(result.isAllowed).toBe(false);
      expect(result.state).toBe('forbidden');
      expect(shouldShowForbidden(result)).toBe(true);
    });

    it('worker is denied access to issuer routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ISSUERS).isAllowed).toBe(false);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS).isAllowed).toBe(
        false,
      );
    });

    it('issuer is denied access to developer routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'issuer-1',
          walletAddress: 'GISSUER',
          walletHash: 'hash2',
          role: 'issuer',
        },
      };

      const result = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(result.isAllowed).toBe(false);
      expect(result.state).toBe('forbidden');
    });

    it('developer is denied access to issuer routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'dev-1',
          walletAddress: 'GDEV',
          walletHash: 'hash3',
          role: 'developer',
        },
      };

      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ISSUERS).isAllowed).toBe(false);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS).isAllowed).toBe(
        false,
      );
    });

    it('hidden nav items prevent access - but direct navigation is still blocked', () => {
      // Scenario: User sees /developers nav link hidden (nav logic), but tries direct URL navigation
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      // Nav should not show the link
      expect(canAccessRoute('worker', PROTECTED_ROUTES.DEVELOPERS)).toBe(false);

      // But if they navigate directly (e.g., via browser history or external link),
      // backend enforcement should block them
      const directAccessResult = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(directAccessResult.isAllowed).toBe(false);
      expect(directAccessResult.state).toBe('forbidden');
    });
  });

  describe('boundary: signed-out state is distinct from forbidden', () => {
    it('unauthenticated access returns unauthorized, not forbidden', () => {
      const unauthenticatedResult = checkRouteAccess(null, PROTECTED_ROUTES.PROOFS);
      expect(unauthenticatedResult.state).toBe('unauthorized');
      expect(unauthenticatedResult.isAllowed).toBe(false);
    });

    it('forbidden is different from unauthorized', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      const forbiddenResult = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(forbiddenResult.state).toBe('forbidden');

      const unauthorizedResult = checkRouteAccess(null, PROTECTED_ROUTES.DEVELOPERS);
      expect(unauthorizedResult.state).toBe('unauthorized');

      expect(forbiddenResult.state).not.toBe(unauthorizedResult.state);
    });

    it('unauthorized triggers redirect to login, forbidden shows 403 page', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      // For unauthenticated user, should redirect to login
      const unauth = checkRouteAccess(null, PROTECTED_ROUTES.PROOFS);
      expect(unauth.state).toBe('unauthorized');

      // For authenticated user without access, should show forbidden page
      const forbidden = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(forbidden.state).toBe('forbidden');
      expect(shouldShowForbidden(forbidden)).toBe(true);
    });
  });

  describe('boundary: role changes invalidate cached decisions', () => {
    it('role change is detected and decisions must be re-evaluated', () => {
      const workerSession: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };

      // Worker cannot access developers initially
      expect(checkRouteAccess(workerSession, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(false);

      // Role is changed (e.g., via backend update and session refresh)
      const developerSession = syncRoleChange(workerSession, 'developer');

      // After role change, authorization changed is detected
      expect(hasAuthorizationChanged(workerSession, developerSession)).toBe(true);

      // And they can now access developers
      expect(checkRouteAccess(developerSession, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(
        true,
      );
    });

    it('cached allowed state from old role does not persist after role change', () => {
      const adminSession: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'admin',
        },
      };

      // Admin can access everything
      expect(checkRouteAccess(adminSession, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(true);

      // Role is downgraded (e.g., after permission revocation)
      const workerSession = syncRoleChange(adminSession, 'worker');

      // Old "allowed" decision must not be used
      expect(checkRouteAccess(workerSession, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(false);
    });

    it('multiple role changes are handled correctly', () => {
      let session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };

      // worker -> issuer
      session = syncRoleChange(session, 'issuer')!;
      expect(getSessionRole(session)).toBe('issuer');
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ISSUERS).isAllowed).toBe(true);

      // issuer -> admin
      session = syncRoleChange(session, 'admin')!;
      expect(getSessionRole(session)).toBe('admin');
      expect(checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(true);

      // admin -> developer
      session = syncRoleChange(session, 'developer')!;
      expect(getSessionRole(session)).toBe('developer');
      expect(checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS).isAllowed).toBe(true);
      expect(checkRouteAccess(session, PROTECTED_ROUTES.SETTINGS_ISSUERS).isAllowed).toBe(false);
    });
  });

  describe('regression: signed-out and not-found states still work', () => {
    it('signed-out redirects to login, not forbidden', () => {
      const result = checkRouteAccess(null, PROTECTED_ROUTES.PROOFS);
      expect(result.state).toBe('unauthorized');
      expect(shouldShowForbidden(result)).toBe(false);
    });

    it('public routes are accessible without authentication', () => {
      // Public routes are not in PROTECTED_ROUTES
      expect(isProtectedRoute('/')).toBe(false);
      expect(isProtectedRoute('/how-it-works')).toBe(false);
      expect(isProtectedRoute('/about')).toBe(false);
    });

    it('404 vs 403 distinction is maintained', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'worker-1',
          walletAddress: 'GWORKER',
          walletHash: 'hash1',
          role: 'worker',
        },
      };

      // 403 Forbidden: authenticated but not allowed
      const forbidden = checkRouteAccess(session, PROTECTED_ROUTES.DEVELOPERS);
      expect(forbidden.state).toBe('forbidden');

      // 404 Not Found would be: route doesn't exist at all
      // (This is handled by Next.js routing, not our access control)
      // But we ensure our forbidden state is semantically correct

      // 401 Unauthorized: not authenticated
      const unauthorized = checkRouteAccess(null, PROTECTED_ROUTES.PROOFS);
      expect(unauthorized.state).toBe('unauthorized');

      // All three are distinct
      expect(forbidden.state).not.toBe(unauthorized.state);
    });
  });

  describe('edge cases and safety', () => {
    it('null/undefined role is treated as unauthenticated', () => {
      const result1 = checkRouteAccess(
        { token: 'token', user: null },
        PROTECTED_ROUTES.PROOFS,
      );
      expect(result1.state).toBe('unauthorized');

      const result2 = getAccessState(undefined, PROTECTED_ROUTES.PROOFS);
      expect(result2).toBe('unauthorized');
    });

    it('empty token should still be treated as unauthorized', () => {
      const session: SessionContext = {
        token: null,
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };

      const result = checkRouteAccess(session, PROTECTED_ROUTES.PROOFS);
      expect(result.state).toBe('unauthorized');
    });

    it('invalid role is treated as unauthenticated', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'invalid_role',
        },
      };

      // Invalid role should not grant access
      expect(checkRouteAccess(session, PROTECTED_ROUTES.PROOFS).isAllowed).toBe(false);
    });

    it('all protected routes must be resolvable', () => {
      Object.values(PROTECTED_ROUTES).forEach((route) => {
        expect(isProtectedRoute(route)).toBe(true);
      });
    });
  });
});
