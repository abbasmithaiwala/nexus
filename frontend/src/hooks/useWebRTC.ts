/**
 * useWebRTC — wires PeerConnectionManager and SignalingManager into the Room page.
 *
 * Responsibilities:
 *  - Creates and stores stable PeerConnectionManager and SignalingManager instances.
 *  - Keeps the local stream in sync with PeerConnectionManager on every change.
 *  - Subscribes to participant join/leave events and drives addPeer/removePeer.
 *  - Maintains a Map<identityHex, MediaStream> of remote streams, exposed as state
 *    so React re-renders VideoTiles when streams arrive.
 *  - Cleans up all connections on unmount.
 *
 * The hook is designed so that Room.tsx only needs to consume `remoteStreams`
 * and pass a stream to each VideoTile by identity.
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
  /** Remote streams keyed by identity hex — triggers re-renders on update. */
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  /** Stable refs to the manager instances. */
  const pcmRef = useRef<PeerConnectionManager | null>(null);
  const sigRef = useRef<SignalingManager | null>(null);

  /** Track participant identities we've already called addPeer for. */
  const knownPeersRef = useRef<Set<string>>(new Set());

  /** Keep participants in a ref for stable callbacks. */
  const participantsRef = useRef(participants);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  /** Keep localStream in a ref so the manager-creation effect can read the latest value. */
  const localStreamRef = useRef(localStream);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // ── Create/destroy managers when db + identity + roomId are all ready ──────
  useEffect(() => {
    if (!db || !identity || roomId == null) return;

    const pcm = new PeerConnectionManager();
    const { iceServers } = getTurnCredentials();
    if (iceServers.length > 0) pcm.setIceServers(iceServers);
    pcmRef.current = pcm;

    // Seed the PCM with any stream that was already acquired before managers were created.
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
    sig.start();

    return () => {
      sig.stop();
      pcm.closeAll();
      pcmRef.current = null;
      sigRef.current = null;
      knownPeersRef.current.clear();
      setRemoteStreams(new Map());
    };
  }, [db, identity, roomId]);

  // ── Keep PeerConnectionManager's local stream up to date ───────────────────
  useEffect(() => {
    if (localStream && pcmRef.current) {
      pcmRef.current.setLocalStream(localStream);
    }
  }, [localStream]);

  // ── React to participant list changes: add / remove peers ──────────────────
  const myHex = identity?.toHexString();

  useEffect(() => {
    const pcm = pcmRef.current;
    const sig = sigRef.current;
    if (!pcm || !sig || !myHex) return;

    const currentHexes = new Set<string>();

    for (const p of participants) {
      const hex = p.identity.toHexString();
      if (hex === myHex) continue; // skip ourselves
      currentHexes.add(hex);

      if (!knownPeersRef.current.has(hex)) {
        knownPeersRef.current.add(hex);
        // This will create the RTCPeerConnection and potentially send an offer.
        sig.handleNewParticipant(hex);
      }
    }

    // Remove peers that have left.
    for (const hex of knownPeersRef.current) {
      if (!currentHexes.has(hex)) {
        pcm.removePeer(hex);
        knownPeersRef.current.delete(hex);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(hex);
          return next;
        });
      }
    }
  }, [participants, myHex]);

  return remoteStreams;
}

/**
 * useWebRTCScreenShare — replaces the outgoing video track on all peer
 * connections whenever the local stream's video track changes (camera ↔ screen).
 *
 * This is a separate hook so Room.tsx can call it after useLocalStream resolves
 * the current track. It watches for changes on the stream object and swaps the
 * sender track on all open peer connections.
 */
export function useWebRTCScreenShare(
  localStream: MediaStream | null,
  isScreenSharing: boolean,
): void {
  // We need a ref to the PCM. This is wired via the module-level singleton
  // approach: the PCM created by useWebRTC is accessed via a shared ref that
  // both hooks write/read. Since hooks can't share refs directly without
  // context, we expose the PCM via a module-level accessor instead.
  //
  // Rather than over-engineering with context, screen share track replacement
  // is handled directly inside useWebRTC by watching localStream changes —
  // setLocalStream already calls replaceTrack on all senders.
  //
  // This hook is intentionally a no-op placeholder; the actual replacement
  // happens in the `useEffect` that calls `pcm.setLocalStream(localStream)`
  // whenever `localStream` changes (which it does on screen share start/stop).
  void localStream;
  void isScreenSharing;
}
