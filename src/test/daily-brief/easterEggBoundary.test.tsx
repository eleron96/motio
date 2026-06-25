import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EasterEggBoundary } from '@/features/daily-brief/easter-eggs/EasterEggBoundary';

const Fine = () => <div>egg ok</div>;
const Boom = () => {
  throw new Error('egg exploded');
};

describe('EasterEggBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught render errors to console.error; the boundary logs a warn.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('renders children when they do not throw', () => {
    render(
      <EasterEggBoundary>
        <Fine />
      </EasterEggBoundary>,
    );
    expect(screen.getByText('egg ok')).toBeInTheDocument();
  });

  it('renders nothing and does not rethrow when a child throws', () => {
    const { container } = render(
      <EasterEggBoundary>
        <Boom />
      </EasterEggBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
