"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { NetworkBadge } from "@/components/common/network-badge";
import { MobileNav } from "@/components/layout/mobile-nav";
import { canAccessRoute } from "@/lib/auth/capabilities";
import { getStorageValue, localStorageDriver } from "@/lib/storage";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/how-it-works", label: "Product" },
  { href: "/proofs", label: "Proofs" },
  { href: "/issuers", label: "Issuers" },
  { href: "/developers", label: "Developers" },
  { href: "/settings", label: "Settings" },
];

export function PublicNav() {
  const pathname = usePathname() ?? "/";

  // Get user role from session storage
  // This mirrors what CreateProofFlow reads on initial mount
  const userRole = useMemo(() => {
    try {
      const session = getStorageValue('SESSION', localStorageDriver);
      return session?.data?.user?.role ?? null;
    } catch {
      return null;
    }
  }, []);

  const isActive = (href: string) =>
    pathname === href ||
    (href === "/proofs" && pathname.startsWith("/proofs")) ||
    (href === "/settings" && pathname.startsWith("/settings"));

  // Filter nav items based on user role
  // This ensures the navigation UI mirrors what the user can actually access
  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        // Public routes like "Product" and "Issuers" are always visible
        if (item.href === "/how-it-works" || item.href === "/issuers") {
          return true;
        }
        // Role-protected routes check capabilities
        return canAccessRoute(userRole, item.href);
      }),
    [userRole],
  );

  return (
    <header className="relative border-b border-white/10 bg-slate-950">
      <div className="flex h-[60px] w-full max-w-[1440px] items-center gap-3 px-3 sm:h-[72px] sm:gap-5 sm:px-5">
        <Link
          className="flex min-w-0 flex-1 items-center gap-2.5 text-xl font-semibold text-white sm:max-w-[210px]"
          href="/"
        >
          <Image
            alt="EarnProof"
            className="h-6 w-6"
            height={24}
            priority
            src="/logo.svg"
            width={24}
          />
          EarnProof
        </Link>

        <nav className="hidden flex-1 items-center gap-6 text-sm text-slate-300 md:flex">
          {visibleNavItems.map((item) => (
            <Link
              className={
                isActive(item.href)
                  ? "font-medium text-cyan-200"
                  : "transition-colors hover:text-white"
              }
              href={item.href}
              key={item.href}
              data-testid={`nav-link-${item.href.replace(/\//g, '-')}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <MobileNav isActive={isActive} items={visibleNavItems} />

        <div className="shrink-0">
          <NetworkBadge />
        </div>
      </div>
    </header>
  );
}
