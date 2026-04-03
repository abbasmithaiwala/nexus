/**
 * ParticipantGrid — composes VideoGrid + VideoTile for all active participants.
 *
 * Owns the tiles derivation: places the local participant first, filters
 * remote participants, and shows an empty-state message when alone.
 */

import { memo, useMemo } from 'react';
import type { Identity } from 'spacetimedb';
import { VideoGrid } from '@/components/VideoGrid';
import { VideoTile, type PresenceStatusCode } from '@/components/VideoTile';
import type { Participant, PresenceStatus } from '@/module_bindings/types';
import type { FloatingReaction } from '@/hooks/useReactions';
import { useAudioLevel } from '@/hooks/useAudioLevel';

function presenceToCode(status: PresenceStatus | undefined): PresenceStatusCode {
  if (!status) return 0;
  const tag = (status as { tag: string }).tag;
  if (tag === 'Active') return 1;
  if (tag === 'Away') return 2;
  if (tag === 'Drowsy') return 3;
  return 0;
}

interface ParticipantTileProps {
  participant: Participant;
  stream: MediaStream | null;
  isLocal: boolean;
  floatingReactions: FloatingReaction[] | undefined;
}

/** Isolated component so each tile gets its own useAudioLevel hook instance. */
const ParticipantTile = memo(function ParticipantTile({
  participant,
  stream,
  isLocal,
  floatingReactions,
}: ParticipantTileProps) {
  const isSpeaking = useAudioLevel(participant.mediaState.audioEnabled ? stream : null);

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
      isSpeaking={isSpeaking}
      mirrored={isLocal && !participant.mediaState.isScreenSharing}
      floatingReactions={floatingReactions}
      presenceStatus={presenceToCode(participant.mediaState.presenceStatus)}
    />
  );
});

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
          <ParticipantTile
            key={participant.participantId.toString()}
            participant={participant}
            stream={stream}
            isLocal={isLocal}
            floatingReactions={floatingReactions.get(participant.identity.toHexString())}
          />
        );
      })}
    </VideoGrid>
  );
}
