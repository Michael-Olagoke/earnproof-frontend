/**
 * Route guard and middleware utilities for role-based access control
 *
 * Provides composable hooks and utilities for protecting routes and actions
 * based on user role and session state.
 */

import { type UserRole, getAccessState, canAccessRoute } from '@/lib/auth/capabilities';
import { type StoredValue } from '@/lib/storage';

export type AccessState = 'allowed' | 'forbidden' | 'unauthorized';

/**
 * Session context for access control decisions
 */
export interface SessionContext {
  token: string | null;
  user: {
    id: string;
    walletAddress: string;
    walletHash: string;
    role: string;
    email?: string;
  } | null;
}

/**
 * Result of access control check
 */
export interface AccessControlResult {
  isAllowed: boolean;
  state: AccessState;
  reason?: string;
}

/**
 * Check if a session has valid authentication
 *
 * @param session - The session context
 * @returns true if the session has both token and user
 */
export function isSessionValid(session: SessionContext | null): boolean {
  return !!session?.token && !!session?.user;
}

/**
 * Get the user's role from session context
 *
 * @param session - The session context
 * @returns The user's role, or null if not authenticated
 */
export function getSessionRole(session: SessionContext | null): UserRole | null {
  if (!session?.user?.role) return null;
  return session.user.role as UserRole;
}

/**
 * Check access to a route based on session context
 *
 * This is the primary guard function. It should be called before rendering
 * protected content or allowing route navigation.
 *
 * @param session - The session context
 * @param route - The route path to check access for
 * @returns AccessControlResult with isAllowed status and access state
 */
export function checkRouteAccess(
  session: SessionContext | null,
  route: string,
): AccessControlResult {
  const role = getSessionRole(session);
  const state = getAccessState(role, route);

  if (state === 'unauthorized') {
    return {
      isAllowed: false,
      state: 'unauthorized',
      reason: 'User is not authenticated',
    };
  }

  if (state === 'forbidden') {
    return {
      isAllowed: false,
      state: 'forbidden',
      reason: `Role "${role}" does not have access to route "${route}"`,
    };
  }

  return {
    isAllowed: true,
    state: 'allowed',
  };
}

/**
 * Check if a route requires role-based access
 *
 * @param route - The route path to check
 * @returns true if the route is protected and requires authentication
 */
export function isProtectedRoute(route: string): boolean {
  const protectedPrefixes = [
    '/proofs',
    '/settings',
    '/developers',
  ];

  return protectedPrefixes.some(
    (prefix) => route === prefix || route.startsWith(prefix + '/'),
  );
}

/**
 * Determine if access should be redirected to login
 *
 * @param result - The access control result
 * @returns true if the user should be redirected to login
 */
export function shouldRedirectToLogin(result: AccessControlResult): boolean {
  return result.state === 'unauthorized';
}

/**
 * Determine if access should show a forbidden page
 *
 * @param result - The access control result
 * @returns true if a forbidden/403 page should be shown
 */
export function shouldShowForbidden(result: AccessControlResult): boolean {
  return result.state === 'forbidden';
}

/**
 * Synchronize access control when role changes mid-session
 *
 * This function should be called whenever a user's role is updated,
 * either through re-authentication or explicit role change.
 *
 * Returns a new session context with updated role information.
 *
 * @param currentSession - The current session
 * @param newRole - The new role for the user
 * @returns Updated session context with new role
 */
export function syncRoleChange(
  currentSession: SessionContext | null,
  newRole: UserRole,
): SessionContext | null {
  if (!currentSession || !currentSession.user) {
    return null;
  }

  return {
    ...currentSession,
    user: {
      ...currentSession.user,
      role: newRole,
    },
  };
}

/**
 * Check if two sessions represent different authorization states
 *
 * This is useful for detecting when a role change requires re-evaluation
 * of current route access.
 *
 * @param session1 - First session
 * @param session2 - Second session
 * @returns true if the sessions have different authorization contexts
 */
export function hasAuthorizationChanged(
  session1: SessionContext | null,
  session2: SessionContext | null,
): boolean {
  if (!session1?.user && !session2?.user) return false;
  if (!session1?.user || !session2?.user) return true;

  return session1.user.id !== session2.user.id || session1.user.role !== session2.user.role;
}

/**
 * Create a session context from stored session data
 *
 * @param storedSession - The stored session value
 * @returns SessionContext or null if invalid
 */
export function sessionContextFromStorage(
  storedSession: StoredValue<'SESSION'> | null,
): SessionContext | null {
  if (!storedSession) return null;

  const { data } = storedSession;
  if (!data.token || !data.user) return null;

  return {
    token: data.token,
    user: data.user,
  };
}

/**
 * Check multiple routes and return which ones are accessible
 *
 * Useful for dynamic navigation filtering.
 *
 * @param session - The session context
 * @param routes - Array of routes to check
 * @returns Object with route as key and boolean access status as value
 */
export function checkMultipleRoutes(
  session: SessionContext | null,
  routes: string[],
): Record<string, boolean> {
  const role = getSessionRole(session);

  return routes.reduce(
    (acc, route) => {
      acc[route] = canAccessRoute(role, route);
      return acc;
    },
    {} as Record<string, boolean>,
  );
}
