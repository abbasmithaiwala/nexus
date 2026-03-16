/**
 * PeerConnectionManager — manages the full mesh of RTCPeerConnections.
 *
 * One instance lives for the duration of a meeting room. The Room page
 * creates it, hands it the local stream, and drives peer lifecycle via
 * addPeer / removePeer as participants join and leave.
 *
 * Key design decisions:
 * - Identity strings are used as Map keys (hex representation).
 * - The manager is a plain class, not a React hook, so it can be held in a
 *   useRef and be stable across renders.
 * - All callbacks (onRemoteStream, onIceCandidate, onNegotiationNeeded) are
 *   settable properties so callers can update them without recreating the manager.
 * - setLocalStream syncs all senders: replaceTrack for existing senders,
 *   addTrack for new ones. Senders for track kinds absent from the new stream
 *   receive replaceTrack(null) to mute the remote side without renegotiation.
 * - When addTrack is unavoidable (user joins with a device off, then enables it),
 *   onnegotiationneeded fires and is forwarded to onNegotiationNeeded so the
 *   SignalingManager can send a fresh offer.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class PeerConnectionManager {
  /** Map<identityHex, RTCPeerConnection> */
  private peers = new Map<string, RTCPeerConnection>();
  /** Map<identityHex, MediaStream> — remote streams received so far */
  private remoteStreams = new Map<string, MediaStream>();
  /** Track the intended kind for each sender so we can match even when track is null */
  private senderKinds = new Map<RTCRtpSender, string>();
  /** The local camera/mic (or screen) stream, added to every new connection */
  private localStream: MediaStream | null = null;
  /** Extra ICE servers (e.g. TURN) injected at runtime */
  private extraIceServers: RTCIceServer[] = [];

  // ── Callbacks set by SignalingManager / Room page ───────────────────────────
  onRemoteStream: ((identityHex: string, stream: MediaStream) => void) | null = null;
  onIceCandidate: ((identityHex: string, candidate: RTCIceCandidate) => void) | null = null;
  /**
   * Called when a peer connection needs renegotiation (e.g. a new track was
   * added via addTrack because there was no prior sender for that kind).
   * The SignalingManager should send a new offer to the given peer.
   */
  onNegotiationNeeded: ((identityHex: string) => void) | null = null;

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  setIceServers(servers: RTCIceServer[]): void {
    this.extraIceServers = servers;
  }

  /**
   * Store the local stream and sync all senders on every existing connection.
   *
   * For each known track kind (audio/video):
   *  - If the new stream has a track of that kind → replaceTrack(newTrack)
   *  - If the new stream is missing a track of that kind → replaceTrack(null)
   *    (silences the remote without renegotiation; the sender slot is preserved
   *     so a later replaceTrack(newTrack) works without needing addTrack)
   *
   * If a track kind is entirely new (no prior sender exists), addTrack is called
   * which triggers onnegotiationneeded → forwarded to onNegotiationNeeded.
   */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const [, pc] of this.peers) {
      this.syncTracksToPeer(pc, stream);
    }
  }

  /**
   * Create a new RTCPeerConnection for a remote participant.
   * Returns the connection so the caller can create/set an offer immediately.
   */
  addPeer(identityHex: string): RTCPeerConnection {
    if (this.peers.has(identityHex)) {
      return this.peers.get(identityHex)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [...ICE_SERVERS, ...this.extraIceServers],
    });

    // Forward ICE candidates to the signaling layer.
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(identityHex, event.candidate);
      }
    };

    // Collect incoming tracks into a MediaStream.
    pc.ontrack = (event) => {
      let stream = this.remoteStreams.get(identityHex);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(identityHex, stream);
      }
      // Replace any existing track of the same kind (re-enabled camera sends
      // a new track object; we update the stream in-place so VideoTile's
      // srcObject reference stays stable and video resumes automatically).
      const existing = stream.getTracks().find((t) => t.kind === event.track.kind);
      if (existing) stream.removeTrack(existing);
      stream.addTrack(event.track);
      this.onRemoteStream?.(identityHex, stream);
    };

    // Renegotiation needed — forward so SignalingManager can send a new offer.
    pc.onnegotiationneeded = () => {
      this.onNegotiationNeeded?.(identityHex);
    };

    // Add local tracks if we already have a stream.
    if (this.localStream) {
      this.syncTracksToPeer(pc, this.localStream);
    }

    this.peers.set(identityHex, pc);
    return pc;
  }

  /** Close and remove a peer connection, cleaning up the remote stream. */
  removePeer(identityHex: string): void {
    const pc = this.peers.get(identityHex);
    if (pc) {
      for (const sender of pc.getSenders()) {
        this.senderKinds.delete(sender);
      }
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.close();
      this.peers.delete(identityHex);
    }
    this.remoteStreams.delete(identityHex);
  }

  /** Return the received remote MediaStream for a peer, if any. */
  getRemoteStream(identityHex: string): MediaStream | null {
    return this.remoteStreams.get(identityHex) ?? null;
  }

  /** Return the RTCPeerConnection for a peer, if it exists. */
  getPeer(identityHex: string): RTCPeerConnection | undefined {
    return this.peers.get(identityHex);
  }

  /** Close all connections — call when leaving the meeting. */
  closeAll(): void {
    for (const [id] of this.peers) {
      this.removePeer(id);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Sync local tracks to a peer connection.
   *
   * Strategy:
   * 1. For each track in `stream`: find an existing sender by kind and call
   *    replaceTrack, or call addTrack if none exists (triggers renegotiation).
   * 2. For each sender whose kind is NOT present in `stream`: call
   *    replaceTrack(null) to silence the remote side without renegotiation.
   *    The sender slot is preserved for future re-enable.
   */
  private syncTracksToPeer(pc: RTCPeerConnection, stream: MediaStream): void {
    const streamKinds = new Set(stream.getTracks().map((t) => t.kind));

    // Step 1: add or replace tracks present in the new stream.
    for (const track of stream.getTracks()) {
      const senders = pc.getSenders();
      const existing =
        senders.find((s) => s.track?.kind === track.kind) ??
        senders.find((s) => this.senderKinds.get(s) === track.kind);

      if (existing) {
        // replaceTrack swaps in-place — no renegotiation needed.
        existing.replaceTrack(track).catch(() => {
          // Ignore; the connection may have been closed concurrently.
        });
      } else {
        // New track kind — addTrack will trigger onnegotiationneeded.
        const sender = pc.addTrack(track, stream);
        this.senderKinds.set(sender, track.kind);
      }
    }

    // Step 2: null-out senders for track kinds no longer in the stream.
    for (const sender of pc.getSenders()) {
      const kind = sender.track?.kind ?? this.senderKinds.get(sender);
      if (kind && !streamKinds.has(kind)) {
        sender.replaceTrack(null).catch(() => {});
      }
    }
  }
}
