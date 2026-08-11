import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GlobalErrorBoundary,
  RouteErrorBoundary,
  ComponentErrorBoundary,
} from '../../../src/components/ErrorBoundary';

// Component that throws on demand
function ThrowChild({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('Intentional render crash for testing');
  return <div>Safe content</div>;
}

// Silence React's expected error output during boundary tests
const suppressErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => {});

// ── GlobalErrorBoundary ───────────────────────────────────────────────────────

describe('GlobalErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children when no error occurs', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowChild shouldThrow={false} />
      </GlobalErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders the crash screen when a child throws', () => {
    suppressErrors();
    render(
      <GlobalErrorBoundary>
        <ThrowChild />
      </GlobalErrorBoundary>
    );
    expect(screen.getByText('Application Error')).toBeInTheDocument();
  });

  it('shows a "Reload page" button in the crash screen', () => {
    suppressErrors();
    render(
      <GlobalErrorBoundary>
        <ThrowChild />
      </GlobalErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('does not render children after a crash', () => {
    suppressErrors();
    render(
      <GlobalErrorBoundary>
        <ThrowChild />
      </GlobalErrorBoundary>
    );
    expect(screen.queryByText('Safe content')).not.toBeInTheDocument();
  });

  it('calls window.location.reload when the Reload page button is clicked', async () => {
    suppressErrors();
    const originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(
      <GlobalErrorBoundary>
        <ThrowChild />
      </GlobalErrorBoundary>
    );
    await userEvent.click(screen.getByRole('button', { name: /reload page/i }));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  });
});

// ── RouteErrorBoundary ────────────────────────────────────────────────────────

describe('RouteErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children when no error occurs', () => {
    render(
      <RouteErrorBoundary>
        <ThrowChild shouldThrow={false} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders the "Page Error" panel when a child throws', () => {
    suppressErrors();
    render(
      <RouteErrorBoundary>
        <ThrowChild />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Page Error')).toBeInTheDocument();
  });

  it('shows console navigation hint in the error panel', () => {
    suppressErrors();
    render(
      <RouteErrorBoundary>
        <ThrowChild />
      </RouteErrorBoundary>
    );
    expect(screen.getByText(/check the console/i)).toBeInTheDocument();
  });
});

// ── ComponentErrorBoundary ────────────────────────────────────────────────────

describe('ComponentErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children when no error occurs', () => {
    render(
      <ComponentErrorBoundary label="MyWidget">
        <ThrowChild shouldThrow={false} />
      </ComponentErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders an inline "Something went wrong" fallback when a child throws', () => {
    suppressErrors();
    render(
      <ComponentErrorBoundary label="MyWidget">
        <ThrowChild />
      </ComponentErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('works without a label prop', () => {
    suppressErrors();
    render(
      <ComponentErrorBoundary>
        <ThrowChild />
      </ComponentErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

// ── Custom fallback prop ──────────────────────────────────────────────────────

describe('GlobalErrorBoundary — custom fallback is not supported at this level', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the crash screen is always the GlobalErrorBoundary fallback', () => {
    suppressErrors();
    render(
      <GlobalErrorBoundary>
        <ThrowChild />
      </GlobalErrorBoundary>
    );
    // The full-page crash screen is the only fallback GlobalErrorBoundary knows about.
    expect(screen.queryByText('Application Error')).toBeInTheDocument();
  });
});
