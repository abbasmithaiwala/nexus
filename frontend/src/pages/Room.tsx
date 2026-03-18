/**
 * RoomPage — thin orchestrator for the live meeting room.
 *
 * All effects and SpaceTimeDB subscriptions live in dedicated hooks.
 * This component owns only: UI state (chat open, reactions open), host
 * derivation, and wiring the hooks together into the layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';

import { useSpacetime } from '@/hooks/useSpacetime';
import { useLocalStream } from '@/hooks/useLocalStream';
import { useRoomId } from '@/hooks/useRoomId';
import { useParticipants } from '@/hooks/useParticipants';
import { useRoomLifecycle } from '@/hooks/useRoomLifecycle';
import { useMediaStateSync } from '@/hooks/useMediaStateSync';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useReactions } from '@/hooks/useReactions';
import { useToast, ToastContainer } from '@/components/Toast';

import { ControlsBar } from '@/components/ControlsBar';
import { ReactionsPanel } from '@/components/ReactionsPanel';
import { RoomHeader } from './room/RoomHeader';
import { ParticipantGrid } from './room/ParticipantGrid';
import { ChatPanel } from './room/ChatPanel';

export function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { db, identity, isConnected, connectionError, reconnectAttempt } = useSpacetime();
  const { toasts, showToast, dismiss } = useToast();

  const local = useLocalStream();
  const roomId = useRoomId(db, roomCode);
  const participants = useParticipants(db, roomId);
  const { handleLeave, handleEndMeeting } = useRoomLifecycle(db, roomId, roomCode);
  const remoteStreams = useWebRTC(db, identity, roomId, participants, local.stream);
  const floatingReactions = useReactions(db, roomId);

  useMediaStateSync(db, roomId, {
    audioEnabled: local.audioEnabled,
    videoEnabled: local.videoEnabled,
    isScreenSharing: local.isScreenSharing,
  });

  // ── Toast for connection errors ───────────────────────────────────────────
  const shownErrorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!connectionError) return;
    const msg = connectionError.message;
    if (msg === shownErrorRef.current) return;
    shownErrorRef.current = msg;
    showToast({ message: `Connection lost. Reconnecting… (attempt ${reconnectAttempt})`, type: 'error', durationMs: 8000 });
  }, [connectionError, reconnectAttempt, showToast]);

  // Notify when reconnected after a failure
  const wasDisconnectedRef = useRef(false);
  useEffect(() => {
    if (!isConnected) { wasDisconnectedRef.current = true; return; }
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      shownErrorRef.current = undefined;
      showToast({ message: 'Reconnected', type: 'success', durationMs: 3000 });
    }
  }, [isConnected, showToast]);

  // Redirect if reconnect exhausted (reconnectAttempt === 5 and still not connected)
  useEffect(() => {
    if (!isConnected && reconnectAttempt >= 5) {
      showToast({ message: 'Could not reconnect. Returning to home.', type: 'error', durationMs: 4000 });
      const t = setTimeout(() => navigate('/'), 4000);
      return () => clearTimeout(t);
    }
  }, [isConnected, reconnectAttempt, navigate, showToast]);

  // ── Camera/mic permission denied toast ───────────────────────────────────
  const shownPermissionToastRef = useRef(false);
  useEffect(() => {
    if (local.stream === null && !shownPermissionToastRef.current) {
      // Wait briefly so we don't flash before getUserMedia resolves
      const t = setTimeout(() => {
        if (local.stream === null) {
          shownPermissionToastRef.current = true;
          showToast({ message: 'Camera/mic permission denied. Others won\'t see or hear you.', type: 'error', durationMs: 0 });
        }
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [local.stream, showToast]);

  // ── Chat / reactions UI state ─────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;

  const handleNewMessage = useCallback(() => {
    if (!isChatOpenRef.current) setUnreadCount((n) => n + 1);
  }, []);

  const handleToggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      if (!prev) setUnreadCount(0); // clear badge when opening
      return !prev;
    });
  }, []);

  const handleCloseChat = useCallback(() => setIsChatOpen(false), []);
  const handleCloseReactions = useCallback(() => setIsReactionsOpen(false), []);
  const handleToggleReactions = useCallback(() => setIsReactionsOpen((p) => !p), []);

  const myParticipant = useMemo(
    () => participants.find((p) => identity && p.identity.isEqual(identity)),
    [participants, identity],
  );
  const isHost = myParticipant?.isHost ?? false;
  const myDisplayName = myParticipant?.displayName ?? '';

  const handleToggleScreenShare = useCallback(() => {
    if (local.isScreenSharing) local.stopScreenShare();
    else local.startScreenShare();
  }, [local]);

  if (!isConnected && reconnectAttempt === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <p className="text-neutral-500 animate-pulse text-sm">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 overflow-hidden">
      <RoomHeader roomCode={roomCode ?? ''} participantCount={participants.length} />

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 p-1 sm:p-2 min-h-0">
          <ParticipantGrid
            participants={participants}
            localParticipant={myParticipant}
            localStream={local.stream}
            remoteStreams={remoteStreams}
            identity={identity}
            floatingReactions={floatingReactions}
          />
        </div>

        {/* On mobile: full-width overlay; on desktop: side panel */}
        {isChatOpen && (
          <div className="absolute inset-0 z-10 md:static md:inset-auto md:z-auto flex">
            <div
              className="flex-1 bg-neutral-950/70 md:hidden"
              onClick={() => setIsChatOpen(false)}
            />
            <ChatPanel
              db={db}
              roomId={roomId}
              myDisplayName={myDisplayName}
              onClose={handleCloseChat}
              onNewMessage={handleNewMessage}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 relative">
        {isReactionsOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1">
            <ReactionsPanel
              db={db}
              roomId={roomId}
              onClose={handleCloseReactions}
            />
          </div>
        )}
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
          onToggleChat={handleToggleChat}
          onOpenReactions={handleToggleReactions}
          onLeave={handleLeave}
          onEndMeeting={handleEndMeeting}
        />
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
