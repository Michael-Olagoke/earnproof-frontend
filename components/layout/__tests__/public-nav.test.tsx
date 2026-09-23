import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { getStorageValue } from '@/lib/storage';
import { PublicNav } from '@/components/layout/public-nav';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/lib/storage', () => ({
  getStorageValue: jest.fn(),
  localStorageDriver: {},
}));

jest.mock('@/components/common/network-badge', () => ({
  NetworkBadge: () => <div data-testid="network-badge">Network Badge</div>,
}));

jest.mock('@/components/layout/mobile-nav', () => ({
  MobileNav: ({ items }: { items: Array<{ href: string; label: string }> }) => (
    <div data-testid="mobile-nav">
      {items.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
    </div>
  ),
}));

const mockUsePathname = usePathname as jest.Mock;
const mockGetStorageValue = getStorageValue as jest.Mock;

describe('PublicNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
  });

  it('should render navigation header', () => {
    mockGetStorageValue.mockReturnValue(null);
    render(<PublicNav />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('should always show public routes when not authenticated', () => {
    mockGetStorageValue.mockReturnValue(null);
    render(<PublicNav />);

    // Public routes should always be visible
    expect(screen.getByTestId('nav-link---how-it-works')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---issuers')).toBeInTheDocument();
  });

  it('should hide protected routes when not authenticated', () => {
    mockGetStorageValue.mockReturnValue(null);
    render(<PublicNav />);

    // Protected routes should not be visible for unauthenticated users
    expect(screen.queryByTestId('nav-link---proofs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-link---developers')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-link---settings')).not.toBeInTheDocument();
  });

  it('should show worker-accessible routes for worker role', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      },
    });

    render(<PublicNav />);

    // Worker can access proofs and settings
    expect(screen.getByTestId('nav-link---proofs')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---settings')).toBeInTheDocument();

    // Worker cannot access developers
    expect(screen.queryByTestId('nav-link---developers')).not.toBeInTheDocument();
  });

  it('should show issuer-accessible routes for issuer role', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'issuer',
        },
      },
    });

    render(<PublicNav />);

    // Issuer can access proofs and settings
    expect(screen.getByTestId('nav-link---proofs')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---settings')).toBeInTheDocument();

    // Issuer cannot access developers
    expect(screen.queryByTestId('nav-link---developers')).not.toBeInTheDocument();
  });

  it('should show developer-accessible routes for developer role', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'developer',
        },
      },
    });

    render(<PublicNav />);

    // Developer can access developers and proofs/settings
    expect(screen.getByTestId('nav-link---proofs')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---settings')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---developers')).toBeInTheDocument();
  });

  it('should show all routes for admin role', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'admin',
        },
      },
    });

    render(<PublicNav />);

    // Admin can access all protected routes
    expect(screen.getByTestId('nav-link---proofs')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---settings')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---developers')).toBeInTheDocument();
  });

  it('should always show public routes regardless of role', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      },
    });

    render(<PublicNav />);

    // Public routes should always be visible
    expect(screen.getByTestId('nav-link---how-it-works')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link---issuers')).toBeInTheDocument();
  });

  it('should handle storage errors gracefully', () => {
    mockGetStorageValue.mockImplementation(() => {
      throw new Error('Storage error');
    });

    render(<PublicNav />);

    // Should not crash and should only show public routes
    expect(screen.getByTestId('nav-link---how-it-works')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-link---proofs')).not.toBeInTheDocument();
  });

  it('should mark active route correctly', () => {
    mockUsePathname.mockReturnValue('/proofs');
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      },
    });

    render(<PublicNav />);

    const proofsLink = screen.getByTestId('nav-link---proofs');
    expect(proofsLink).toHaveClass('font-medium');
  });

  it('should pass visible items to mobile nav', () => {
    mockGetStorageValue.mockReturnValue({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          walletAddress: 'GXXX',
          walletHash: 'hash',
          role: 'worker',
        },
      },
    });

    render(<PublicNav />);

    const mobileNav = screen.getByTestId('mobile-nav');
    // Worker should see 4 items: how-it-works, proofs, issuers, settings
    const mobileNavLinks = mobileNav.querySelectorAll('a');
    expect(mobileNavLinks.length).toBe(4);
  });
});
