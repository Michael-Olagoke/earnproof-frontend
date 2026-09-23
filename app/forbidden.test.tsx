import { render, screen } from '@testing-library/react';
import ForbiddenPage from '@/app/forbidden';

jest.mock('@/components/layout/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/common/page-heading', () => ({
  PageHeading: ({ title, description, eyebrow }: { title: string; description: string; eyebrow: string }) => (
    <div>
      <div data-testid="page-heading-eyebrow">{eyebrow}</div>
      <h1 data-testid="page-heading-title">{title}</h1>
      <p data-testid="page-heading-description">{description}</p>
    </div>
  ),
}));

jest.mock('@/components/common/production-ui', () => ({
  pageContainer: 'page-container-class',
}));

describe('ForbiddenPage', () => {
  it('should render with stable test identifier', () => {
    render(<ForbiddenPage />);
    expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
  });

  it('should display 403 error code', () => {
    render(<ForbiddenPage />);
    expect(screen.getByTestId('page-heading-eyebrow')).toHaveTextContent('403');
  });

  it('should show access denied title', () => {
    render(<ForbiddenPage />);
    expect(screen.getByTestId('page-heading-title')).toHaveTextContent('Access denied');
  });

  it('should explain permission requirement', () => {
    render(<ForbiddenPage />);
    expect(screen.getByTestId('page-heading-description')).toHaveTextContent(
      "Your role doesn't have permission"
    );
  });

  it('should display permission explanation', () => {
    render(<ForbiddenPage />);
    expect(screen.getByText(/You are authenticated and signed in/)).toBeInTheDocument();
  });

  it('should have link to dashboard', () => {
    render(<ForbiddenPage />);
    const dashboardLink = screen.getByRole('link', { name: /Go to dashboard/ });
    expect(dashboardLink).toHaveAttribute('href', '/');
  });

  it('should have link to support/help', () => {
    render(<ForbiddenPage />);
    const helpLink = screen.getByRole('link', { name: /Get help/ });
    expect(helpLink).toHaveAttribute('href', '/accessibility');
  });

  it('should display error code reference', () => {
    render(<ForbiddenPage />);
    expect(screen.getByText(/403_FORBIDDEN/)).toBeInTheDocument();
  });

  it('should be distinct from 404 page (different titles)', () => {
    const { getByTestId } = render(<ForbiddenPage />);
    // 403 uses "Access denied" not "Page not found"
    expect(getByTestId('page-heading-title')).toHaveTextContent('Access denied');
  });

  it('should provide clear action buttons', () => {
    render(<ForbiddenPage />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((link) => link.textContent?.includes('dashboard'))).toBe(true);
    expect(links.some((link) => link.textContent?.includes('help'))).toBe(true);
  });
});
