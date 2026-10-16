import { PageHeading } from "@/components/common/page-heading";
import { pageContainer } from "@/components/common/production-ui";
import { PublicShell } from "@/components/layout/public-shell";
import { ReconciliationDigestComparison } from "@/components/reconciliation/reconciliation-digest-comparison";
import { readStoredSession } from "@/lib/session/read-stored-session";

/**
 * Reconciliation settings page.
 *
 * Allows operators with ADMIN or ISSUER role to compare contract state
 * between the backend's projection and the live on-chain digest.
 */
export default function ReconciliationPage() {
  const session = readStoredSession();

  return (
    <PublicShell>
      <section className={`${pageContainer} gap-8 sm:gap-10`}>
        <PageHeading
          description="Compare backend contract state projection against live on-chain digest. Select a network and contract, review component-level mismatches, track data freshness, and export results for offline review."
          eyebrow="Operations & Reconciliation"
          title="Contract State Digest Comparison"
        />
        <ReconciliationDigestComparison session={session} />
      </section>
    </PublicShell>
  );
}
