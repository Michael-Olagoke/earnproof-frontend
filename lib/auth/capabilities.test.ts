import {
  canAccessRoute,
  canPerformAction,
  getAccessibleRoutes,
  getAccessState,
  isAuthenticated,
  PROTECTED_ROUTES,
  ROLE_CAPABILITIES,
  type UserRole,
} from '@/lib/auth/capabilities';

describe('capabilities', () => {
  describe('canAccessRoute', () => {
    it('should deny access for unauthenticated users', () => {
      expect(canAccessRoute(null, PROTECTED_ROUTES.PROOFS)).toBe(false);
      expect(canAccessRoute(undefined, PROTECTED_ROUTES.PROOFS)).toBe(false);
    });

    it('should allow workers to access proofs and settings', () => {
      expect(canAccessRoute('worker', PROTECTED_ROUTES.PROOFS)).toBe(true);
      expect(canAccessRoute('worker', PROTECTED_ROUTES.SETTINGS)).toBe(true);
    });

    it('should deny workers access to developers and issuers routes', () => {
      expect(canAccessRoute('worker', PROTECTED_ROUTES.DEVELOPERS)).toBe(false);
      expect(canAccessRoute('worker', PROTECTED_ROUTES.SETTINGS_ISSUERS)).toBe(false);
      expect(canAccessRoute('worker', PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS)).toBe(false);
    });

    it('should allow issuers to access organization and issuer settings', () => {
      expect(canAccessRoute('issuer', PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS)).toBe(true);
      expect(canAccessRoute('issuer', PROTECTED_ROUTES.SETTINGS_ISSUERS)).toBe(true);
    });

    it('should deny issuers access to developer routes', () => {
      expect(canAccessRoute('issuer', PROTECTED_ROUTES.DEVELOPERS)).toBe(false);
      expect(canAccessRoute('issuer', PROTECTED_ROUTES.DEVELOPERS_API_KEYS)).toBe(false);
    });

    it('should allow developers to access developer routes', () => {
      expect(canAccessRoute('developer', PROTECTED_ROUTES.DEVELOPERS)).toBe(true);
      expect(canAccessRoute('developer', PROTECTED_ROUTES.DEVELOPERS_API_KEYS)).toBe(true);
    });

    it('should deny developers access to issuer routes', () => {
      expect(canAccessRoute('developer', PROTECTED_ROUTES.SETTINGS_ISSUERS)).toBe(false);
      expect(canAccessRoute('developer', PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS)).toBe(false);
    });

    it('should allow admins to access all protected routes', () => {
      Object.values(PROTECTED_ROUTES).forEach((route) => {
        expect(canAccessRoute('admin', route)).toBe(true);
      });
    });

    it('should support nested route matching', () => {
      expect(canAccessRoute('worker', '/proofs/minimum-income')).toBe(true);
      expect(canAccessRoute('worker', '/settings/personal')).toBe(true);
      expect(canAccessRoute('worker', '/proofs/payment-receipt')).toBe(true);
    });

    it('should not match partial route prefixes', () => {
      expect(canAccessRoute('worker', '/proof')).toBe(false); // '/proofs' is required
      expect(canAccessRoute('worker', '/settings-other')).toBe(false);
    });
  });

  describe('canPerformAction', () => {
    it('should deny actions for unauthenticated users', () => {
      expect(canPerformAction(null, 'create_proof')).toBe(false);
      expect(canPerformAction(undefined, 'manage_organizations')).toBe(false);
    });

    it('should allow workers to create proofs', () => {
      expect(canPerformAction('worker', 'create_proof')).toBe(true);
      expect(canPerformAction('worker', 'view_payments')).toBe(true);
    });

    it('should deny workers from managing organizations', () => {
      expect(canPerformAction('worker', 'manage_organizations')).toBe(false);
      expect(canPerformAction('worker', 'manage_issuers')).toBe(false);
    });

    it('should allow issuers to manage organizations and issuers', () => {
      expect(canPerformAction('issuer', 'manage_organizations')).toBe(true);
      expect(canPerformAction('issuer', 'manage_issuers')).toBe(true);
    });

    it('should allow developers to manage API keys', () => {
      expect(canPerformAction('developer', 'manage_api_keys')).toBe(true);
    });

    it('should deny developers from managing organizations', () => {
      expect(canPerformAction('developer', 'manage_organizations')).toBe(false);
    });

    it('should allow admins to perform all actions', () => {
      expect(canPerformAction('admin', 'create_proof')).toBe(true);
      expect(canPerformAction('admin', 'manage_organizations')).toBe(true);
      expect(canPerformAction('admin', 'manage_issuers')).toBe(true);
      expect(canPerformAction('admin', 'manage_api_keys')).toBe(true);
      expect(canPerformAction('admin', 'manage_developers')).toBe(true);
    });

    it('should return false for unknown actions', () => {
      expect(canPerformAction('worker', 'unknown_action')).toBe(false);
    });
  });

  describe('getAccessibleRoutes', () => {
    it('should return empty array for unauthenticated users', () => {
      expect(getAccessibleRoutes(null)).toEqual([]);
      expect(getAccessibleRoutes(undefined)).toEqual([]);
    });

    it('should return worker routes for workers', () => {
      const routes = getAccessibleRoutes('worker');
      expect(routes).toContain(PROTECTED_ROUTES.PROOFS);
      expect(routes).toContain(PROTECTED_ROUTES.SETTINGS);
      expect(routes.length).toBe(2);
    });

    it('should return issuer routes for issuers', () => {
      const routes = getAccessibleRoutes('issuer');
      expect(routes).toContain(PROTECTED_ROUTES.PROOFS);
      expect(routes).toContain(PROTECTED_ROUTES.SETTINGS);
      expect(routes).toContain(PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS);
      expect(routes).toContain(PROTECTED_ROUTES.SETTINGS_ISSUERS);
    });

    it('should return all protected routes for admins', () => {
      const routes = getAccessibleRoutes('admin');
      Object.values(PROTECTED_ROUTES).forEach((route) => {
        expect(routes).toContain(route);
      });
    });
  });

  describe('isAuthenticated', () => {
    it('should return false for null or undefined', () => {
      expect(isAuthenticated(null)).toBe(false);
      expect(isAuthenticated(undefined)).toBe(false);
    });

    it('should return true for valid roles', () => {
      expect(isAuthenticated('worker')).toBe(true);
      expect(isAuthenticated('issuer')).toBe(true);
      expect(isAuthenticated('developer')).toBe(true);
      expect(isAuthenticated('admin')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isAuthenticated('invalid' as UserRole)).toBe(false);
    });
  });

  describe('getAccessState', () => {
    it('should return unauthorized for unauthenticated access', () => {
      expect(getAccessState(null, PROTECTED_ROUTES.PROOFS)).toBe('unauthorized');
      expect(getAccessState(undefined, PROTECTED_ROUTES.PROOFS)).toBe('unauthorized');
    });

    it('should return allowed for authenticated users with access', () => {
      expect(getAccessState('worker', PROTECTED_ROUTES.PROOFS)).toBe('allowed');
      expect(getAccessState('worker', PROTECTED_ROUTES.SETTINGS)).toBe('allowed');
    });

    it('should return forbidden for authenticated users without access', () => {
      expect(getAccessState('worker', PROTECTED_ROUTES.DEVELOPERS)).toBe('forbidden');
      expect(getAccessState('developer', PROTECTED_ROUTES.SETTINGS_ISSUERS)).toBe('forbidden');
      expect(getAccessState('issuer', PROTECTED_ROUTES.DEVELOPERS_API_KEYS)).toBe('forbidden');
    });

    it('should return allowed for admin users', () => {
      expect(getAccessState('admin', PROTECTED_ROUTES.PROOFS)).toBe('allowed');
      expect(getAccessState('admin', PROTECTED_ROUTES.SETTINGS_ISSUERS)).toBe('allowed');
      expect(getAccessState('admin', PROTECTED_ROUTES.DEVELOPERS_API_KEYS)).toBe('allowed');
    });

    it('should handle nested routes correctly', () => {
      expect(getAccessState('worker', '/proofs/minimum-income')).toBe('allowed');
      expect(getAccessState('worker', '/developers/api-keys')).toBe('forbidden');
    });
  });

  describe('ROLE_CAPABILITIES consistency', () => {
    it('should have all roles defined in the capabilities map', () => {
      const validRoles: UserRole[] = ['worker', 'issuer', 'developer', 'admin'];
      validRoles.forEach((role) => {
        expect(ROLE_CAPABILITIES[role]).toBeDefined();
        expect(Array.isArray(ROLE_CAPABILITIES[role])).toBe(true);
      });
    });

    it('should have no duplicate routes for any role', () => {
      Object.entries(ROLE_CAPABILITIES).forEach(([role, routes]) => {
        const uniqueRoutes = new Set(routes);
        expect(uniqueRoutes.size).toBe(routes.length);
      });
    });

    it('should only use defined PROTECTED_ROUTES', () => {
      const protectedRouteValues = Object.values(PROTECTED_ROUTES);
      Object.entries(ROLE_CAPABILITIES).forEach(([role, routes]) => {
        routes.forEach((route) => {
          expect(protectedRouteValues).toContain(route);
        });
      });
    });

    it('should have hierarchical access (higher roles have more access)', () => {
      const workerRoutes = new Set(ROLE_CAPABILITIES.worker);
      const issuerRoutes = new Set(ROLE_CAPABILITIES.issuer);
      const developerRoutes = new Set(ROLE_CAPABILITIES.developer);
      const adminRoutes = new Set(ROLE_CAPABILITIES.admin);

      // Workers should be able to do their own stuff
      expect(workerRoutes.size).toBeGreaterThan(0);

      // Issuers should have at least worker access
      workerRoutes.forEach((route) => {
        expect(issuerRoutes.has(route)).toBe(true);
      });

      // Admins should have access to everything
      issuerRoutes.forEach((route) => {
        expect(adminRoutes.has(route)).toBe(true);
      });
      developerRoutes.forEach((route) => {
        expect(adminRoutes.has(route)).toBe(true);
      });
    });
  });
});
