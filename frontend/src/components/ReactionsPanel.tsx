/**
 * ReactionsPanel — popup emoji picker anchored above the reactions button.
 *
 * Clicking an emoji calls the send_reaction reducer. Closes on outside click.
 */

import { useEffect, useRef } from 'react';
import type { DbConnection } from '@/module_bindings';

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉'] as const;

interface ReactionsPanelProps {
  db: DbConnection | null;
  roomId: bigint | null;
  onClose: () => void;
}

export function ReactionsPanel({ db, roomId, onClose }: ReactionsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const handleEmoji = (emoji: string) => {
    if (!db || roomId == null) return;
    db.reducers.sendReaction({ roomId, emoji });
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-2xl px-3 py-2 shadow-xl z-50 flex gap-1"
      role="dialog"
      aria-label="Emoji reactions"
    >
      {ALLOWED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleEmoji(emoji)}
          className="text-2xl hover:scale-125 transition-transform active:scale-110 p-1 rounded-lg hover:bg-gray-700"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
