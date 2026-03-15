/**
 * Layout — shared page wrapper used by all routes.
 * Provides a full-height container with a consistent background.
 */

import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
