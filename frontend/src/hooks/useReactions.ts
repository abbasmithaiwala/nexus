/**
 * useReactions — subscribes to ReactionSent room_events and tracks
 * active floating reactions keyed by participant identity hex.
 *
 * Returns a Map<identityHex, FloatingReaction[]> so each VideoTile can
 * render its own floating emoji animations.
 */

import { useEffect, useState } from 'react';
import type { DbConnection } from '@/module_bindings';
import type { RoomEvent } from '@/module_bindings/types';

interface ReactionPayload {
  emoji: string;
  display_name: string;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
}

/** How long (ms) a floating reaction stays visible before being removed. */
const REACTION_DURATION_MS = 2200;

export function useReactions(
  db: DbConnection | null,
  roomId: bigint | null,
): Map<string, FloatingReaction[]> {
  // Map<identityHex, FloatingReaction[]>
  const [reactions, setReactions] = useState<Map<string, FloatingReaction[]>>(new Map());

  useEffect(() => {
    if (!db || roomId == null) return;

    const handleInsert = (_ctx: unknown, event: RoomEvent) => {
      if (event.roomId !== roomId) return;
      if (event.eventType.tag !== 'ReactionSent') return;

      let payload: ReactionPayload;
      try {
        payload = JSON.parse(event.payload) as ReactionPayload;
      } catch {
        return;
      }

      const identityHex = event.identity.toHexString();
      const reaction: FloatingReaction = {
        id: `${event.eventId}-${Date.now()}`,
        emoji: payload.emoji,
      };

      setReactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(identityHex) ?? [];
        next.set(identityHex, [...existing, reaction]);
        return next;
      });

      // Auto-remove after animation completes
      setTimeout(() => {
        setReactions((prev) => {
          const next = new Map(prev);
          const existing = next.get(identityHex) ?? [];
          const filtered = existing.filter((r) => r.id !== reaction.id);
          if (filtered.length === 0) {
            next.delete(identityHex);
          } else {
            next.set(identityHex, filtered);
          }
          return next;
        });
      }, REACTION_DURATION_MS);
    };

    db.db.room_event.onInsert(handleInsert);
    return () => {
      db.db.room_event.removeOnInsert(handleInsert);
    };
  }, [db, roomId]);

  return reactions;
}
