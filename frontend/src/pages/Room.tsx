/**
 * RoomPage — thin orchestrator for the live meeting room.
 *
 * All effects and SpaceTimeDB subscriptions live in dedicated hooks.
 * This component owns only: UI state (chat open), host derivation, and
 * wiring the hooks together into the layout.
 */

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { useSpacetime } from '@/hooks/useSpacetime';
import { useLocalStream } from '@/hooks/useLocalStream';
import { useRoomId } from '@/hooks/useRoomId';
import { useParticipants } from '@/hooks/useParticipants';
import { useRoomLifecycle } from '@/hooks/useRoomLifecycle';
import { useMediaStateSync } from '@/hooks/useMediaStateSync';
import { useWebRTC } from '@/hooks/useWebRTC';

import { ControlsBar } from '@/components/ControlsBar';
import { RoomHeader } from './room/RoomHeader';
import { ParticipantGrid } from './room/ParticipantGrid';
import { ChatPanel } from './room/ChatPanel';

export function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { db, identity, isConnected } = useSpacetime();

  const local = useLocalStream();
  const roomId = useRoomId(db, roomCode);
  const participants = useParticipants(db, roomId);
  const { handleLeave, handleEndMeeting } = useRoomLifecycle(db, roomId, roomCode);
  const remoteStreams = useWebRTC(db, identity, roomId, participants, local.stream);

  useMediaStateSync(db, roomId, {
    audioEnabled: local.audioEnabled,
    videoEnabled: local.videoEnabled,
    isScreenSharing: local.isScreenSharing,
  });

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount] = useState(0); // wired in Phase 9

  const myParticipant = useMemo(
    () => participants.find((p) => identity && p.identity.isEqual(identity)),
    [participants, identity],
  );
  const isHost = myParticipant?.isHost ?? false;

  const handleToggleScreenShare = useCallback(() => {
    if (local.isScreenSharing) local.stopScreenShare();
    else local.startScreenShare();
  }, [local]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      <RoomHeader roomCode={roomCode ?? ''} participantCount={participants.length} />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 p-2 min-h-0">
          <ParticipantGrid
            participants={participants}
            localParticipant={myParticipant}
            localStream={local.stream}
            remoteStreams={remoteStreams}
            identity={identity}
          />
        </div>

        {isChatOpen && <ChatPanel onClose={() => setIsChatOpen(false)} />}
      </div>

      <div className="shrink-0">
        <ControlsBar
          audioEnabled={local.audioEnabled}
          videoEnabled={local.videoEnabled}
          isScreenSharing={local.isScreenSharing}
          isChatOpen={isChatOpen}
          unreadCount={unreadCount}
          isHost={isHost}
          onToggleAudio={local.toggleAudio}
          onToggleVideo={local.toggleVideo}
          onToggleScreenShare={handleToggleScreenShare}
          onToggleChat={() => setIsChatOpen((p) => !p)}
          onOpenReactions={() => { /* Phase 9 */ }}
          onLeave={handleLeave}
          onEndMeeting={handleEndMeeting}
        />
      </div>
    </div>
  );
}
