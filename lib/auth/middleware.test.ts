import {
  checkRouteAccess,
  getSessionRole,
  hasAuthorizationChanged,
  isProtectedRoute,
  isSessionValid,
  shouldRedirectToLogin,
  shouldShowForbidden,
  syncRoleChange,
  type SessionContext,
} from '@/lib/auth/middleware';

describe('middleware', () => {
  describe('isSessionValid', () => {
    it('should return false for null session', () => {
      expect(isSessionValid(null)).toBe(false);
    });

    it('should return false if missing token', () => {
      const session: SessionContext = {
        token: null,
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      expect(isSessionValid(session)).toBe(false);
    });

    it('should return false if missing user', () => {
      const session: SessionContext = {
        token: 'token123',
        user: null,
      };
      expect(isSessionValid(session)).toBe(false);
    });

    it('should return true if both token and user present', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      expect(isSessionValid(session)).toBe(true);
    });
  });

  describe('getSessionRole', () => {
    it('should return null for null session', () => {
      expect(getSessionRole(null)).toBeNull();
    });

    it('should return null if user missing', () => {
      const session: SessionContext = {
        token: 'token123',
        user: null,
      };
      expect(getSessionRole(session)).toBeNull();
    });

    it('should return null if role missing', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: '',
        },
      };
      expect(getSessionRole(session)).toBeNull();
    });

    it('should return user role when present', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'developer',
        },
      };
      expect(getSessionRole(session)).toBe('developer');
    });
  });

  describe('checkRouteAccess', () => {
    it('should return unauthorized for null session', () => {
      const result = checkRouteAccess(null, '/proofs');
      expect(result.isAllowed).toBe(false);
      expect(result.state).toBe('unauthorized');
    });

    it('should return allowed for worker accessing /proofs', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      const result = checkRouteAccess(session, '/proofs');
      expect(result.isAllowed).toBe(true);
      expect(result.state).toBe('allowed');
    });

    it('should return forbidden for worker accessing /developers', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      const result = checkRouteAccess(session, '/developers');
      expect(result.isAllowed).toBe(false);
      expect(result.state).toBe('forbidden');
      expect(result.reason).toContain('does not have access');
    });

    it('should return allowed for admin accessing any protected route', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'admin',
        },
      };
      expect(checkRouteAccess(session, '/proofs').isAllowed).toBe(true);
      expect(checkRouteAccess(session, '/developers').isAllowed).toBe(true);
      expect(checkRouteAccess(session, '/settings').isAllowed).toBe(true);
    });

    it('should handle nested routes', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      expect(checkRouteAccess(session, '/proofs/minimum-income').isAllowed).toBe(true);
      expect(checkRouteAccess(session, '/settings/personal').isAllowed).toBe(true);
    });
  });

  describe('isProtectedRoute', () => {
    it('should return true for /proofs routes', () => {
      expect(isProtectedRoute('/proofs')).toBe(true);
      expect(isProtectedRoute('/proofs/minimum-income')).toBe(true);
      expect(isProtectedRoute('/proofs/payment-receipt')).toBe(true);
    });

    it('should return true for /settings routes', () => {
      expect(isProtectedRoute('/settings')).toBe(true);
      expect(isProtectedRoute('/settings/organizations')).toBe(true);
      expect(isProtectedRoute('/settings/personal')).toBe(true);
    });

    it('should return true for /developers routes', () => {
      expect(isProtectedRoute('/developers')).toBe(true);
      expect(isProtectedRoute('/developers/api-keys')).toBe(true);
    });

    it('should return false for public routes', () => {
      expect(isProtectedRoute('/')).toBe(false);
      expect(isProtectedRoute('/how-it-works')).toBe(false);
      expect(isProtectedRoute('/about')).toBe(false);
      expect(isProtectedRoute('/contact')).toBe(false);
    });

    it('should not match partial prefixes', () => {
      expect(isProtectedRoute('/proof')).toBe(false);
      expect(isProtectedRoute('/settings-other')).toBe(false);
    });
  });

  describe('shouldRedirectToLogin', () => {
    it('should return true for unauthorized state', () => {
      expect(
        shouldRedirectToLogin({
          isAllowed: false,
          state: 'unauthorized',
        }),
      ).toBe(true);
    });

    it('should return false for forbidden state', () => {
      expect(
        shouldRedirectToLogin({
          isAllowed: false,
          state: 'forbidden',
        }),
      ).toBe(false);
    });

    it('should return false for allowed state', () => {
      expect(
        shouldRedirectToLogin({
          isAllowed: true,
          state: 'allowed',
        }),
      ).toBe(false);
    });
  });

  describe('shouldShowForbidden', () => {
    it('should return false for unauthorized state', () => {
      expect(
        shouldShowForbidden({
          isAllowed: false,
          state: 'unauthorized',
        }),
      ).toBe(false);
    });

    it('should return true for forbidden state', () => {
      expect(
        shouldShowForbidden({
          isAllowed: false,
          state: 'forbidden',
        }),
      ).toBe(true);
    });

    it('should return false for allowed state', () => {
      expect(
        shouldShowForbidden({
          isAllowed: true,
          state: 'allowed',
        }),
      ).toBe(false);
    });
  });

  describe('syncRoleChange', () => {
    it('should return null for null session', () => {
      expect(syncRoleChange(null, 'admin')).toBeNull();
    });

    it('should update role in session', () => {
      const session: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };
      const updated = syncRoleChange(session, 'admin');
      expect(updated?.user?.role).toBe('admin');
      expect(updated?.user?.id).toBe('user-1');
      expect(updated?.token).toBe('token123');
    });

    it('should preserve other session fields', () => {
      const session: SessionContext = {
        token: 'my-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXXXXXXXX',
          walletHash: 'my-hash',
          role: 'worker',
          email: 'test@example.com',
        },
      };
      const updated = syncRoleChange(session, 'issuer');
      expect(updated?.user?.email).toBe('test@example.com');
      expect(updated?.user?.walletAddress).toBe('GXXXXXXXXX');
    });
  });

  describe('hasAuthorizationChanged', () => {
    const baseSession: SessionContext = {
      token: 'token123',
      user: {
        id: 'user-1',
        walletAddress: 'GXXX',
        walletHash: 'hash',
        role: 'worker',
      },
    };

    it('should return false when both sessions are null', () => {
      expect(hasAuthorizationChanged(null, null)).toBe(false);
    });

    it('should return true when one session is null', () => {
      expect(hasAuthorizationChanged(baseSession, null)).toBe(true);
      expect(hasAuthorizationChanged(null, baseSession)).toBe(true);
    });

    it('should return false when sessions are identical', () => {
      expect(hasAuthorizationChanged(baseSession, baseSession)).toBe(false);
    });

    it('should return true when user ID changes', () => {
      const changedSession = {
        ...baseSession,
        user: { ...baseSession.user!, id: 'user-2' },
      };
      expect(hasAuthorizationChanged(baseSession, changedSession)).toBe(true);
    });

    it('should return true when role changes', () => {
      const changedSession = {
        ...baseSession,
        user: { ...baseSession.user!, role: 'admin' },
      };
      expect(hasAuthorizationChanged(baseSession, changedSession)).toBe(true);
    });

    it('should return false when other fields change', () => {
      const changedSession = {
        ...baseSession,
        user: { ...baseSession.user!, email: 'new@example.com' },
      };
      expect(hasAuthorizationChanged(baseSession, changedSession)).toBe(false);
    });
  });

  describe('route access boundary conditions', () => {
    it('should deny access for role changes mid-session', () => {
      // User starts as worker
      const initialSession: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };

      // Worker cannot access /developers
      expect(checkRouteAccess(initialSession, '/developers').isAllowed).toBe(false);

      // Role is upgraded to developer
      const upgradedSession = syncRoleChange(initialSession, 'developer');

      // Now they can access /developers
      expect(checkRouteAccess(upgradedSession, '/developers').isAllowed).toBe(true);
    });

    it('should detect authorization changes for route re-evaluation', () => {
      const worker: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      };

      const admin: SessionContext = {
        token: 'token123',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'admin',
        },
      };

      expect(hasAuthorizationChanged(worker, admin)).toBe(true);

      // After role change, should re-check all routes
      const result = checkRouteAccess(admin, '/developers');
      expect(result.isAllowed).toBe(true);
    });
  });
});
