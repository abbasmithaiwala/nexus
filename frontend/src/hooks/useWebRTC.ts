/**
 * useWebRTC — wires PeerConnectionManager and SignalingManager into the Room page.
 *
 * Responsibilities:
 *  - Creates and stores stable PeerConnectionManager and SignalingManager instances.
 *  - Keeps the local stream in sync with PeerConnectionManager on every change.
 *  - Subscribes to participant join/leave events and drives peer lifecycle.
 *  - Maintains a Map<identityHex, MediaStream> of remote streams as React state
 *    so VideoTiles re-render when streams arrive or change.
 *  - Cleans up all connections on unmount.
 */

import { useEffect, useRef, useState } from 'react';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@/module_bindings';
import type { Participant } from '@/module_bindings/types';
import { PeerConnectionManager } from '@/lib/webrtc';
import { SignalingManager } from '@/lib/signaling';
import { getTurnCredentials } from '@/lib/turn';

export function useWebRTC(
  db: DbConnection | null,
  identity: Identity | undefined,
  roomId: bigint | null,
  participants: Participant[],
  localStream: MediaStream | null,
): Map<string, MediaStream> {
  const localStreamReady = localStream !== null;
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const pcmRef = useRef<PeerConnectionManager | null>(null);
  const sigRef = useRef<SignalingManager | null>(null);
  const knownPeersRef = useRef<Set<string>>(new Set());

  const participantsRef = useRef(participants);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const localStreamRef = useRef(localStream);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // ── Create/destroy managers ─────────────────────────────────────────────
  useEffect(() => {
    if (!db || !identity || roomId == null) return;

    const pcm = new PeerConnectionManager();
    pcmRef.current = pcm;

    if (localStreamRef.current) {
      pcm.setLocalStream(localStreamRef.current);
    }

    pcm.onRemoteStream = (hex, stream) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(hex, stream);
        return next;
      });
    };

    const sig = new SignalingManager(db, identity, roomId, pcm);
    sigRef.current = sig;

    // Start signaling immediately so onInsert is registered before any
    // participant effect fires — avoids missing offers/answers during the
    // async TURN credential fetch.
    sig.start();

    getTurnCredentials().then(({ iceServers }) => {
      if (iceServers.length > 0) pcm.setIceServers(iceServers);
    }).catch(() => {
      // Fall back to STUN-only — sig is already started above.
    });

    return () => {
      sig.stop();
      pcm.closeAll();
      pcmRef.current = null;
      sigRef.current = null;
      knownPeersRef.current.clear();
      setRemoteStreams(new Map());
    };
  }, [db, identity, roomId]);

  // ── Keep local stream in sync ───────────────────────────────────────────
  useEffect(() => {
    if (localStream && pcmRef.current) {
      pcmRef.current.setLocalStream(localStream);
    }
  }, [localStream]);

  // ── React to participant list changes ───────────────────────────────────
  const myHex = identity?.toHexString();

  useEffect(() => {
    const pcm = pcmRef.current;
    const sig = sigRef.current;
    if (!pcm || !sig || !myHex || !localStreamReady) return;

    const currentHexes = new Set<string>();

    for (const p of participants) {
      const hex = p.identity.toHexString();
      if (hex === myHex) continue;
      currentHexes.add(hex);

      if (!knownPeersRef.current.has(hex)) {
        knownPeersRef.current.add(hex);
        sig.handleNewParticipant(hex);
      }
    }

    for (const hex of knownPeersRef.current) {
      if (!currentHexes.has(hex)) {
        sig.removePeer(hex);
        knownPeersRef.current.delete(hex);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(hex);
          return next;
        });
      }
    }
  }, [participants, myHex, localStreamReady]);

  return remoteStreams;
}

/**
 * useWebRTCScreenShare — no-op placeholder.
 *
 * Screen share track replacement is handled automatically by the setLocalStream
 * effect above: when localStream changes (camera → screen or back), setLocalStream
 * calls replaceTrack on all existing senders without renegotiation.
 */
export function useWebRTCScreenShare(
  localStream: MediaStream | null,
  isScreenSharing: boolean,
): void {
  void localStream;
  void isScreenSharing;
}
