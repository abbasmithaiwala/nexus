/**
 * VideoGrid — responsive grid layout for participant video tiles.
 *
 * Layout rules (matching the task spec):
 *  1 participant  → full screen
 *  2 participants → side by side (2 columns)
 *  3–4            → 2×2 grid
 *  5+             → dynamic auto-fill wrap
 *
 * Screen share mode: when screenShareIndex is provided, that tile spans 2
 * columns and is placed first, with the remaining thumbnails stacked in a
 * single column on the right.
 */

import type { ReactNode } from 'react';

interface VideoGridProps {
  /** Rendered VideoTile elements. */
  children: ReactNode[];
  /**
   * Index of the tile that is currently screen sharing.
   * When set, that tile gets a prominent large-slot layout.
   */
  screenShareIndex?: number;
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  // On mobile (< sm) always use a single column so tiles are large enough.
  // On sm+ use the multi-column layouts.
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-1';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-2';
  if (count <= 6) return 'grid-cols-2 sm:grid-cols-3 sm:grid-rows-2';
  if (count <= 9) return 'grid-cols-2 sm:grid-cols-3 sm:grid-rows-3';
  return 'grid-cols-2 sm:grid-cols-4';
}

export function VideoGrid({ children, screenShareIndex }: VideoGridProps) {
  const count = children.length;

  // ── Screen share layout ────────────────────────────────────────────────────
  // When someone is sharing their screen, show the screen tile prominently on
  // the left and stack the other participant thumbnails in a narrow sidebar.
  if (screenShareIndex !== undefined && count > 1) {
    const screenTile = children[screenShareIndex];
    const otherTiles = children.filter((_, i) => i !== screenShareIndex);

    return (
      <div className="flex gap-2 w-full h-full">
        {/* Large screen-share tile */}
        <div className="flex-1 min-h-0 min-w-0">
          {screenTile}
        </div>
        {/* Thumbnail sidebar */}
        <div className="flex flex-col gap-2 w-40 shrink-0 overflow-y-auto">
          {otherTiles.map((tile, i) => (
            <div key={i} className="aspect-video min-w-0 shrink-0">
              {tile}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Normal grid layout ─────────────────────────────────────────────────────
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
