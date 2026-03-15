/**
 * VideoGrid — responsive grid layout for participant video tiles.
 *
 * Layout rules (matching the task spec):
 *  1 participant  → full screen
 *  2 participants → side by side (2 columns)
 *  3–4            → 2×2 grid
 *  5+             → dynamic auto-fill wrap
 */

import type { ReactNode } from 'react';

interface VideoGridProps {
  /** Rendered VideoTile elements. */
  children: ReactNode[];
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  if (count <= 4) return 'grid-cols-2 grid-rows-2';
  if (count <= 6) return 'grid-cols-3 grid-rows-2';
  if (count <= 9) return 'grid-cols-3 grid-rows-3';
  return 'grid-cols-4';
}

export function VideoGrid({ children }: VideoGridProps) {
  const count = children.length;

  return (
    <div className={`grid gap-2 w-full h-full ${gridClass(count)}`}>
      {children.map((child, i) => (
        <div key={i} className="min-h-0 min-w-0">
          {child}
        </div>
      ))}
    </div>
  );
}
