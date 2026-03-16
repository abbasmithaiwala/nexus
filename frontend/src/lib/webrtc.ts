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
 * - All callbacks (onRemoteStream, onIceCandidate) are settable properties so
 *   callers can update them without recreating the manager.
 * - replaceVideoTrack swaps the outgoing video track on every open connection,
 *   covering both camera→screen and screen→camera transitions.
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

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  setIceServers(servers: RTCIceServer[]): void {
    this.extraIceServers = servers;
  }

  /** Store the local stream and add its tracks to every existing connection. */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const [, pc] of this.peers) {
      this.addLocalTracksToPeer(pc, stream);
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
      // Avoid duplicates (ontrack can fire per track).
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      this.onRemoteStream?.(identityHex, stream);
    };

    // Add local tracks if we already have a stream.
    if (this.localStream) {
      this.addLocalTracksToPeer(pc, this.localStream);
    }

    this.peers.set(identityHex, pc);
    return pc;
  }

  /** Close and remove a peer connection, cleaning up the remote stream. */
  removePeer(identityHex: string): void {
    const pc = this.peers.get(identityHex);
    if (pc) {
      // Clean up sender kind tracking for this connection's senders.
      for (const sender of pc.getSenders()) {
        this.senderKinds.delete(sender);
      }
      pc.onicecandidate = null;
      pc.ontrack = null;
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

  /**
   * Swap the outgoing video track on every open connection.
   * Used when starting/stopping screen share.
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    const replacements: Promise<void>[] = [];
    for (const [, pc] of this.peers) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        replacements.push(sender.replaceTrack(newTrack));
      }
    }
    await Promise.all(replacements);
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
   * Add all tracks from `stream` to `pc`, replacing any existing sender for
   * the same kind to avoid duplicate senders.
   *
   * Senders are matched by kind using both the live track (when present) and
   * the recorded intended kind (senderKinds map), so we always prefer
   * replaceTrack over addTrack — addTrack requires renegotiation while
   * replaceTrack swaps the track in-place without it.
   */
  private addLocalTracksToPeer(pc: RTCPeerConnection, stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      const senders = pc.getSenders();
      const existing =
        senders.find((s) => s.track?.kind === track.kind) ??
        senders.find((s) => this.senderKinds.get(s) === track.kind);
      if (existing) {
        existing.replaceTrack(track);
      } else {
        const sender = pc.addTrack(track, stream);
        this.senderKinds.set(sender, track.kind);
      }
    }
  }
}
