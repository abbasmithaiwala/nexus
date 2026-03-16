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
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">Nexus</span>
        <span className="text-gray-500 text-sm">·</span>
        <span className="text-gray-400 text-sm font-mono">{roomCode}</span>
        <button
          onClick={handleCopy}
          title="Copy room code"
          aria-label="Copy room code"
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <span className="text-gray-500 text-xs">
        {participantCount} participant{participantCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
