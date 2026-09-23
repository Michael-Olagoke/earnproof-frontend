import Link from "next/link";
import { PageHeading } from "@/components/common/page-heading";
import { pageContainer } from "@/components/common/production-ui";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata = {
  title: "Access Denied",
  description: "You don't have permission to access this resource.",
};

/**
 * Forbidden (403) page component
 *
 * Rendered when an authenticated user attempts to access a route
 * their role doesn't have permission for. Distinct from 404 (not found)
 * and from unauthenticated redirects.
 *
 * Provides stable identifier for tests: data-testid="forbidden-page"
 */
export default function ForbiddenPage() {
  return (
    <PublicShell>
      <section className={pageContainer} data-testid="forbidden-page">
        <PageHeading
          description="Your role doesn't have permission to access this resource. If you believe this is a mistake, please contact support."
          eyebrow="403"
          title="Access denied"
        />
        <div className="space-y-6">
          <div className="rounded-lg border border-rose-300/30 bg-rose-300/10 p-6">
            <h2 className="text-lg font-semibold text-rose-100 mb-3">
              Permission required
            </h2>
            <p className="text-sm text-slate-300">
              You are authenticated and signed in, but your current role does not have 
              permission to access this feature. Contact your administrator if you need 
              access to this resource.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white mb-2">Return to home</h3>
              <p className="text-sm text-slate-300 mb-4">
                Go back to the main dashboard and navigate to resources available to your role.
              </p>
              <Link
                href="/"
                className="w-full inline-flex h-10 items-center justify-center rounded-lg border border-cyan-300/50 bg-cyan-300 px-6 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              >
                Go to dashboard
              </Link>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <h3 className="font-semibold text-white mb-2">Contact support</h3>
              <p className="text-sm text-slate-300 mb-4">
                If you need access to this feature, please reach out to our support team.
              </p>
              <Link
                href="/accessibility"
                className="w-full inline-flex h-10 items-center justify-center rounded-lg border border-white/15 px-6 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Get help
              </Link>
            </div>
          </div>

          <div className="text-sm text-slate-400">
            <p>
              Error code: <code className="text-cyan-300">403_FORBIDDEN</code>
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
