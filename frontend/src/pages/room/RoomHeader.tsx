/** RoomHeader — top bar showing the brand, room code, and participant count. */

interface RoomHeaderProps {
  roomCode: string;
  participantCount: number;
}

export function RoomHeader({ roomCode, participantCount }: RoomHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">Nexus</span>
        <span className="text-gray-500 text-sm">·</span>
        <span className="text-gray-400 text-sm font-mono">{roomCode}</span>
      </div>
      <span className="text-gray-500 text-xs">
        {participantCount} participant{participantCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
