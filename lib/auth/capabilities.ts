/**
 * Role-based access control and capability definitions
 *
 * Centralizes authorization logic for routes and actions based on user role.
 * This is the single source of truth for what each role can access.
 */

export type UserRole = 'worker' | 'issuer' | 'admin' | 'developer';

/**
 * Route paths that require authentication or role-based access
 */
export const PROTECTED_ROUTES = {
  PROOFS: '/proofs',
  SETTINGS: '/settings',
  SETTINGS_ORGANIZATIONS: '/settings/organizations',
  SETTINGS_ISSUERS: '/settings/issuers',
  DEVELOPERS: '/developers',
  DEVELOPERS_API_KEYS: '/developers/api-keys',
} as const;

export type ProtectedRoute = (typeof PROTECTED_ROUTES)[keyof typeof PROTECTED_ROUTES];

/**
 * Capability definitions for each role
 * Maps roles to the routes/actions they can access
 */
export const ROLE_CAPABILITIES: Record<UserRole, ProtectedRoute[]> = {
  // Worker: can create proofs and manage personal settings
  worker: [
    PROTECTED_ROUTES.PROOFS,
    PROTECTED_ROUTES.SETTINGS,
  ],
  // Issuer: can manage organization and issuers, plus worker capabilities
  issuer: [
    PROTECTED_ROUTES.PROOFS,
    PROTECTED_ROUTES.SETTINGS,
    PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS,
    PROTECTED_ROUTES.SETTINGS_ISSUERS,
  ],
  // Developer: can manage API keys and developer resources
  developer: [
    PROTECTED_ROUTES.PROOFS,
    PROTECTED_ROUTES.SETTINGS,
    PROTECTED_ROUTES.DEVELOPERS,
    PROTECTED_ROUTES.DEVELOPERS_API_KEYS,
  ],
  // Admin: can access all routes
  admin: [
    PROTECTED_ROUTES.PROOFS,
    PROTECTED_ROUTES.SETTINGS,
    PROTECTED_ROUTES.SETTINGS_ORGANIZATIONS,
    PROTECTED_ROUTES.SETTINGS_ISSUERS,
    PROTECTED_ROUTES.DEVELOPERS,
    PROTECTED_ROUTES.DEVELOPERS_API_KEYS,
  ],
};

/**
 * Check if a role can access a specific route
 *
 * @param role - The user's role
 * @param route - The route to check access for
 * @returns true if the role can access the route, false otherwise
 */
export function canAccessRoute(role: UserRole | null | undefined, route: string): boolean {
  if (!role) return false;

  const capabilities = ROLE_CAPABILITIES[role];
  if (!capabilities) return false;

  // Check exact match or prefix match for nested routes
  return capabilities.some(
    (capability) => route === capability || route.startsWith(capability + '/'),
  );
}

/**
 * Check if a role can perform a specific action
 *
 * @param role - The user's role
 * @param action - The action to check (e.g., 'create_proof', 'manage_issuers')
 * @returns true if the role can perform the action, false otherwise
 */
export function canPerformAction(
  role: UserRole | null | undefined,
  action: string,
): boolean {
  if (!role) return false;

  // Define action-to-capability mappings
  const actionCapabilities: Record<string, UserRole[]> = {
    create_proof: ['worker', 'issuer', 'developer', 'admin'],
    view_payments: ['worker', 'issuer', 'developer', 'admin'],
    manage_personal_settings: ['worker', 'issuer', 'developer', 'admin'],
    manage_organizations: ['issuer', 'admin'],
    manage_issuers: ['issuer', 'admin'],
    manage_api_keys: ['developer', 'admin'],
    manage_developers: ['admin'],
  };

  const allowedRoles = actionCapabilities[action];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

/**
 * Get all accessible routes for a given role
 *
 * @param role - The user's role
 * @returns Array of routes the role can access
 */
export function getAccessibleRoutes(role: UserRole | null | undefined): ProtectedRoute[] {
  if (!role || !ROLE_CAPABILITIES[role]) {
    return [];
  }
  return ROLE_CAPABILITIES[role];
}

/**
 * Check if a user is authenticated (has a valid role)
 *
 * @param role - The user's role
 * @returns true if the role is a valid, recognized role
 */
export function isAuthenticated(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return Object.keys(ROLE_CAPABILITIES).includes(role);
}

/**
 * Determine if access to a route should result in a forbidden (403) response
 * vs. a redirect to login vs. a 404
 *
 * Returns 'forbidden' if the user is authenticated but lacks access,
 * 'unauthorized' if the user is not authenticated,
 * 'allowed' if access is permitted
 *
 * @param role - The user's role (null if not authenticated)
 * @param route - The route being accessed
 * @returns 'allowed' | 'forbidden' | 'unauthorized'
 */
export function getAccessState(
  role: UserRole | null | undefined,
  route: string,
): 'allowed' | 'forbidden' | 'unauthorized' {
  if (!isAuthenticated(role)) {
    return 'unauthorized';
  }

  if (canAccessRoute(role, route)) {
    return 'allowed';
  }

  return 'forbidden';
}
