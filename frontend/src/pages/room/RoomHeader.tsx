/** RoomHeader — top bar showing the brand, room code, and participant count. */

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface RoomHeaderProps {
  roomCode: string;
  participantCount: number;
}

export function RoomHeader({ roomCode, participantCount }: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-950/90 border-b border-neutral-900 shrink-0 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className="text-white font-semibold text-sm tracking-tight">Nexus</span>
        <span className="text-neutral-700 text-sm">·</span>
        <span className="text-neutral-500 text-xs font-mono">{roomCode}</span>
        <button
          onClick={handleCopy}
          title="Copy room code"
          aria-label="Copy room code"
          className="text-neutral-600 hover:text-neutral-300 transition-colors"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        </button>
      </div>
      <span className="text-neutral-600 text-xs">
        {participantCount} participant{participantCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
