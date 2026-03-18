/**
 * ParticipantGrid — composes VideoGrid + VideoTile for all active participants.
 *
 * Owns the tiles derivation: places the local participant first, filters
 * remote participants, and shows an empty-state message when alone.
 */

import { useMemo } from 'react';
import type { Identity } from 'spacetimedb';
import { VideoGrid } from '@/components/VideoGrid';
import { VideoTile } from '@/components/VideoTile';
import type { Participant } from '@/module_bindings/types';
import type { FloatingReaction } from '@/hooks/useReactions';

interface ParticipantGridProps {
  participants: Participant[];
  localParticipant: Participant | undefined;
  localStream: MediaStream | null;
  /** Remote MediaStreams keyed by identity hex string, provided by useWebRTC. */
  remoteStreams: Map<string, MediaStream>;
  identity: Identity | undefined;
  /** Floating reactions keyed by identity hex string, provided by useReactions. */
  floatingReactions: Map<string, FloatingReaction[]>;
}

export function ParticipantGrid({
  participants,
  localParticipant,
  localStream,
  remoteStreams,
  identity,
  floatingReactions,
}: ParticipantGridProps) {
  const tiles = useMemo(() => {
    const local = localParticipant
      ? [{ participant: localParticipant, isLocal: true }]
      : [];

    const remote = participants
      .filter((p) => !identity || !p.identity.isEqual(identity))
      .map((p) => ({ participant: p, isLocal: false }));

    return [...local, ...remote];
  }, [participants, localParticipant, identity]);

  if (tiles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-neutral-600 text-sm">Waiting for participants…</p>
      </div>
    );
  }

  // Find which tile index (if any) is screen sharing so VideoGrid can give it
  // the prominent layout slot.
  const screenShareIndex = tiles.findIndex(
    ({ participant }) => participant.mediaState.isScreenSharing,
  );

  return (
    <VideoGrid screenShareIndex={screenShareIndex >= 0 ? screenShareIndex : undefined}>
      {tiles.map(({ participant, isLocal }) => {
        const stream = isLocal
          ? localStream
          : remoteStreams.get(participant.identity.toHexString()) ?? null;
        return (
          <VideoTile
            key={participant.participantId.toString()}
            stream={stream}
            displayName={participant.displayName}
            audioEnabled={participant.mediaState.audioEnabled}
            videoEnabled={participant.mediaState.videoEnabled}
            isScreenSharing={participant.mediaState.isScreenSharing}
            isLocal={isLocal}
            isHost={participant.isHost}
            mirrored={isLocal && !participant.mediaState.isScreenSharing}
            floatingReactions={floatingReactions.get(participant.identity.toHexString())}
          />
        );
      })}
    </VideoGrid>
  );
}
