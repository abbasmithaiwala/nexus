/**
 * PeerConnectionManager
 *
 * Manages the mesh of RTCPeerConnections. One PCM instance lives for the
 * duration of a meeting room.
 *
 * - onnegotiationneeded is forwarded unconditionally to SignalingManager which
 *   uses the Perfect Negotiation pattern (makingOffer / ignoreOffer flags) to
 *   handle glare and re-entrancy correctly across Chrome and Safari.
 * - Both connectionstatechange and iceconnectionstatechange are monitored;
 *   Safari iOS does not reliably fire connectionstatechange.
 * - ontrack replaces existing tracks of the same kind in-place so VideoTile's
 *   srcObject reference stays stable. onunmute re-fires onRemoteStream for
 *   browsers that deliver tracks initially muted (Safari, Firefox).
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class PeerConnectionManager {
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private senderKinds = new Map<string, Map<RTCRtpSender, string>>();
  private localStream: MediaStream | null = null;
  private extraIceServers: RTCIceServer[] = [];

  onRemoteStream: ((identityHex: string, stream: MediaStream) => void) | null = null;
  onIceCandidate: ((identityHex: string, candidate: RTCIceCandidate) => void) | null = null;
  onNegotiationNeeded: ((identityHex: string) => void) | null = null;
  onConnectionFailed: ((identityHex: string) => void) | null = null;
  onConnectionRestored: ((identityHex: string) => void) | null = null;
  onIceServersUpdated: ((identityHex: string) => void) | null = null;

  setIceServers(servers: RTCIceServer[]): void {
    this.extraIceServers = servers;
    // Notify SignalingManager to restart ICE on any existing connections that
    // were created before TURN credentials arrived — they used STUN-only and
    // may have failed to traverse NAT.
    for (const [identityHex] of this.peers) {
      this.onIceServersUpdated?.(identityHex);
    }
  }

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const [identityHex, pc] of this.peers) {
      this.syncTracksToPeer(identityHex, pc, stream);
    }
  }

  addPeer(identityHex: string): RTCPeerConnection {
    if (this.peers.has(identityHex)) {
      return this.peers.get(identityHex)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [...ICE_SERVERS, ...this.extraIceServers],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    this.peers.set(identityHex, pc);
    this.senderKinds.set(identityHex, new Map());

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(identityHex, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      let stream = this.remoteStreams.get(identityHex);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(identityHex, stream);
      }
      // Replace existing track of same kind so VideoTile's srcObject stays stable.
      const existing = stream.getTracks().find((t) => t.kind === event.track.kind);
      if (existing) stream.removeTrack(existing);
      stream.addTrack(event.track);

      // Notify with a *new* MediaStream wrapper so that React's memo comparison
      // always sees a changed reference and re-runs the srcObject effect, even
      // when the same underlying stream is mutated by a later track arrival.
      const notify = () => {
        const snapshot = new MediaStream(stream!.getTracks());
        this.remoteStreams.set(identityHex, snapshot);
        this.onRemoteStream?.(identityHex, snapshot);
      };

      // Safari/Firefox deliver tracks initially muted; re-fire on unmute.
      event.track.onunmute = notify;

      notify();
    };

    // Forward unconditionally — SignalingManager's Perfect Negotiation flags
    // (makingOffer, ignoreOffer, suppressNextNegotiation) handle all cases.
    pc.onnegotiationneeded = () => {
      this.onNegotiationNeeded?.(identityHex);
    };

    // connectionstatechange: Chrome, Firefox, newer Safari
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'disconnected') {
        this.onConnectionFailed?.(identityHex);
      } else if (s === 'connected') {
        this.onConnectionRestored?.(identityHex);
      }
    };

    // iceconnectionstatechange: reliable on Safari iOS where connectionstatechange is not
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'failed' || s === 'disconnected') {
        this.onConnectionFailed?.(identityHex);
      }
    };

    if (this.localStream) {
      this.syncTracksToPeer(identityHex, pc, this.localStream);
    }

    return pc;
  }

  removePeer(identityHex: string): void {
    const pc = this.peers.get(identityHex);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      this.peers.delete(identityHex);
    }
    this.senderKinds.delete(identityHex);
    this.remoteStreams.delete(identityHex);
  }

  getRemoteStream(identityHex: string): MediaStream | null {
    return this.remoteStreams.get(identityHex) ?? null;
  }

  getPeer(identityHex: string): RTCPeerConnection | undefined {
    return this.peers.get(identityHex);
  }

  closeAll(): void {
    for (const [id] of this.peers) {
      this.removePeer(id);
    }
  }

  private applyVideoEncodingParams(sender: RTCRtpSender): void {
    // setParameters is async and may fail before negotiation completes — retry once after a short delay.
    const apply = () => {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 1_200_000; // 1.2 Mbps ceiling; browser degrades gracefully below this
      params.encodings[0].maxFramerate = 30;
      sender.setParameters(params).catch(() => {});
    };
    apply();
    // Retry after negotiation settles in case the first call was too early.
    setTimeout(apply, 2000);
  }

  private syncTracksToPeer(identityHex: string, pc: RTCPeerConnection, stream: MediaStream): void {
    const streamKinds = new Set(stream.getTracks().map((t) => t.kind));
    const peerSenderKinds = this.senderKinds.get(identityHex) ?? new Map<RTCRtpSender, string>();

    for (const track of stream.getTracks()) {
      const senders = pc.getSenders();
      const existing =
        senders.find((s) => s.track?.kind === track.kind) ??
        senders.find((s) => peerSenderKinds.get(s) === track.kind);

      if (existing) {
        existing.replaceTrack(track).catch(() => {});
        if (track.kind === 'video') this.applyVideoEncodingParams(existing);
      } else {
        const sender = pc.addTrack(track, stream);
        peerSenderKinds.set(sender, track.kind);
        this.senderKinds.set(identityHex, peerSenderKinds);
        if (track.kind === 'video') this.applyVideoEncodingParams(sender);
      }
    }

    for (const sender of pc.getSenders()) {
      const kind = sender.track?.kind ?? peerSenderKinds.get(sender);
      if (kind && !streamKinds.has(kind)) {
        sender.replaceTrack(null).catch(() => {});
      }
    }
  }
}
