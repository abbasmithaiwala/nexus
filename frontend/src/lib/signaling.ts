/**
 * SignalingManager — drives WebRTC offer/answer/ICE exchange via SpaceTimeDB.
 *
 * Architecture:
 *  - SpaceTimeDB's `signaling_message` table acts as the signaling channel.
 *  - Each client subscribes to rows where `toIdentity == myIdentity`.
 *  - Exactly one side sends the offer, determined by lexicographic comparison
 *    of the two hex identity strings:
 *      myHex > theirHex  →  I am the offerer (impolite)
 *      myHex < theirHex  →  I am the answerer (polite); replay cached offer
 *    This is deterministic and prevents both sides creating an offer simultaneously.
 *
 * Renegotiation (e.g. user enables camera after joining):
 *  - onnegotiationneeded is debounced per peer and results in a new offer from
 *    whichever side fires it, only when the connection is already stable.
 *  - On the answerer side, a renegotiation offer is applied in-place.
 *
 * ICE restart:
 *  - On connection failure, only the offerer side (higher hex) initiates a
 *    restart to avoid both sides restarting simultaneously.
 */

import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@/module_bindings';
import type { SignalingMessage } from '@/module_bindings/types';
import type { PeerConnectionManager } from './webrtc';

/**
 * Reorder the m=video payload types so the preferred codec appears first.
 * The browser honours the ordering during codec negotiation.
 */
function preferVideoCodec(sdp: string, codec: 'VP9' | 'VP8' | 'H264'): string {
  const lines = sdp.split('\r\n');
  const videoLineIdx = lines.findIndex((l) => l.startsWith('m=video'));
  if (videoLineIdx === -1) return sdp;

  const codecPts = lines
    .filter((l) => l.startsWith('a=rtpmap:') && l.toLowerCase().includes(codec.toLowerCase()))
    .map((l) => l.split(':')[1].split(' ')[0]);

  if (codecPts.length === 0) return sdp;

  const mParts = lines[videoLineIdx].split(' ');
  const header = mParts.slice(0, 3);
  const pts = mParts.slice(3);
  const reordered = [...codecPts, ...pts.filter((p) => !codecPts.includes(p))];
  lines[videoLineIdx] = [...header, ...reordered].join(' ');
  return lines.join('\r\n');
}

export class SignalingManager {
  private db: DbConnection;
  private myIdentity: Identity;
  private myHex: string;
  private roomId: bigint;
  private pcm: PeerConnectionManager;

  /** Queued ICE candidates that arrived before the remote description was set */
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  /** Track which peers have their remote description set (ready for ICE) */
  private remoteDescSet = new Set<string>();

  /** Serialise offer handling per peer to prevent concurrent processOffer calls */
  private offerLocks = new Map<string, Promise<void>>();

  /** Debounce timers for renegotiation — prevents offer storm on multi-track add */
  private renegotiationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Guards against concurrent sendOffer calls for the same peer */
  private makingOffer = new Set<string>();

  /** ICE restart timers — one per peer */
  private restartTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Consecutive ICE restart attempts per peer — reset on successful connection */
  private iceRestartAttempts = new Map<string, number>();

  private boundOnInsert: (ctx: unknown, row: SignalingMessage) => void;

  constructor(
    db: DbConnection,
    myIdentity: Identity,
    roomId: bigint,
    pcm: PeerConnectionManager,
  ) {
    this.db = db;
    this.myIdentity = myIdentity;
    this.myHex = myIdentity.toHexString();
    this.roomId = roomId;
    this.pcm = pcm;

    this.boundOnInsert = this.handleIncomingMessage.bind(this);

    this.pcm.onIceCandidate = (identityHex, candidate) => {
      this.sendIceCandidate(identityHex, candidate);
    };

    // Renegotiation: debounced per peer, only fires on stable connections.
    this.pcm.onNegotiationNeeded = (identityHex) => {
      this.scheduleRenegotiation(identityHex);
    };

    this.pcm.onConnectionFailed = (identityHex) => {
      this.scheduleIceRestart(identityHex);
    };

    this.pcm.onConnectionRestored = (identityHex) => {
      this.iceRestartAttempts.delete(identityHex);
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  start(): void {
    this.db.db.signaling_message.onInsert(this.boundOnInsert);
  }

  stop(): void {
    this.db.db.signaling_message.removeOnInsert(this.boundOnInsert);
    this.offerLocks.clear();
    this.makingOffer.clear();
    for (const t of this.renegotiationTimers.values()) clearTimeout(t);
    this.renegotiationTimers.clear();
    for (const t of this.restartTimers.values()) clearTimeout(t);
    this.restartTimers.clear();
    this.iceRestartAttempts.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Participant join — deterministic offerer selection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called when a remote participant joins.
   *
   * Offerer  = higher hex (myHex > theirHex) — creates RTCPeerConnection and sends offer.
   * Answerer = lower hex (myHex < theirHex)  — creates RTCPeerConnection and replays
   *            any cached offer/ICE that arrived before we subscribed.
   */
  handleNewParticipant(identityHex: string): void {
    if (this.myHex > identityHex) {
      // I am the offerer: add the peer and send an offer.
      // addPeer fires onnegotiationneeded → scheduleRenegotiation → sendOffer.
      // We call sendOffer directly here too as a fallback in case
      // onnegotiationneeded does not fire (Safari timing).
      this.pcm.addPeer(identityHex);
      this.sendOffer(identityHex).catch(() => {});
    } else {
      // I am the answerer: add the peer, then replay any cached messages.
      this.pcm.addPeer(identityHex);
      this.replayForPeer(identityHex);
    }
  }

  /** Called when a participant leaves. */
  removePeer(identityHex: string): void {
    this.teardownPeer(identityHex);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Offer sending
  // ──────────────────────────────────────────────────────────────────────────

  private async sendOffer(toIdentityHex: string): Promise<void> {
    if (this.makingOffer.has(toIdentityHex)) return;
    const pc = this.pcm.getPeer(toIdentityHex);
    if (!pc) return;
    if (pc.signalingState !== 'stable') return;

    this.makingOffer.add(toIdentityHex);
    try {
      const offer = await pc.createOffer();
      // Re-check after async gap.
      if (this.pcm.getPeer(toIdentityHex) !== pc) return;
      if (pc.signalingState !== 'stable') return;
      // Prefer VP9 — better quality at low bandwidth than the VP8 default.
      if (offer.sdp) offer.sdp = preferVideoCodec(offer.sdp, 'VP9');
      await pc.setLocalDescription(offer);

      const toIdentity = this.hexToIdentity(toIdentityHex);
      if (!toIdentity || this.pcm.getPeer(toIdentityHex) !== pc) return;

      this.db.reducers.sendOffer({
        roomId: this.roomId,
        toIdentity,
        sdp: JSON.stringify(pc.localDescription),
      });
    } catch {
      // createOffer/setLocalDescription failed (connection closed, etc.) — ignore.
    } finally {
      this.makingOffer.delete(toIdentityHex);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Renegotiation (debounced)
  // ──────────────────────────────────────────────────────────────────────────

  private scheduleRenegotiation(identityHex: string): void {
    const existing = this.renegotiationTimers.get(identityHex);
    if (existing) clearTimeout(existing);

    const t = setTimeout(() => {
      this.renegotiationTimers.delete(identityHex);
      const pc = this.pcm.getPeer(identityHex);
      if (!pc || pc.signalingState !== 'stable') return;
      this.sendOffer(identityHex).catch(() => {});
    }, 0);

    this.renegotiationTimers.set(identityHex, t);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ICE restart
  // ──────────────────────────────────────────────────────────────────────────

  private scheduleIceRestart(identityHex: string): void {
    const existing = this.restartTimers.get(identityHex);
    if (existing) clearTimeout(existing);

    // Only the offerer (higher hex) initiates restart to avoid both sides restarting.
    if (this.myHex < identityHex) return;

    const attempts = this.iceRestartAttempts.get(identityHex) ?? 0;
    if (attempts >= 3) {
      // Exhausted retries — tear down so a fresh reconnect can occur on the next signaling event.
      this.teardownPeer(identityHex);
      return;
    }
    this.iceRestartAttempts.set(identityHex, attempts + 1);

    const t = setTimeout(() => {
      this.restartTimers.delete(identityHex);
      const pc = this.pcm.getPeer(identityHex);
      if (!pc) return;
      this.sendIceRestartOffer(identityHex).catch(() => {});
    }, 500);

    this.restartTimers.set(identityHex, t);
  }

  private async sendIceRestartOffer(identityHex: string): Promise<void> {
    const pc = this.pcm.getPeer(identityHex);
    if (!pc) return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      if (this.pcm.getPeer(identityHex) !== pc) return;
      if (offer.sdp) offer.sdp = preferVideoCodec(offer.sdp, 'VP9');
      await pc.setLocalDescription(offer);
      const toIdentity = this.hexToIdentity(identityHex);
      if (!toIdentity) return;
      this.db.reducers.sendOffer({
        roomId: this.roomId,
        toIdentity,
        sdp: JSON.stringify(pc.localDescription),
      });
    } catch {
      // Connection closed — ignore.
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Incoming message dispatch
  // ──────────────────────────────────────────────────────────────────────────

  private async handleIncomingMessage(_ctx: unknown, msg: SignalingMessage): Promise<void> {
    if (msg.roomId !== this.roomId) return;
    if (!msg.toIdentity.isEqual(this.myIdentity)) return;

    const fromHex = msg.fromIdentity.toHexString();
    const tag = msg.messageType.tag;

    if (tag === 'Offer') {
      await this.handleOffer(fromHex, msg.payload);
    } else if (tag === 'Answer') {
      await this.handleAnswer(fromHex, msg.payload);
    } else if (tag === 'IceCandidate') {
      await this.handleIceCandidate(fromHex, msg.payload);
    }
  }

  // ── Offer ──────────────────────────────────────────────────────────────────

  private handleOffer(fromHex: string, payload: string): Promise<void> {
    // Serialise offer processing per peer to prevent concurrent calls from
    // corrupting the RTCPeerConnection state machine.
    const prev = this.offerLocks.get(fromHex) ?? Promise.resolve();
    const next = prev.then(() => this.processOffer(fromHex, payload));
    this.offerLocks.set(fromHex, next.catch(() => {}));
    return next;
  }

  private async processOffer(fromHex: string, payload: string): Promise<void> {
    const offer: RTCSessionDescriptionInit = JSON.parse(payload);

    // Lazily create a peer if we haven't seen this participant yet
    // (offer arrived before handleNewParticipant fired).
    if (!this.pcm.getPeer(fromHex)) {
      this.pcm.addPeer(fromHex);
    }

    const pc = this.pcm.getPeer(fromHex)!;

    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
      // Non-stable, non-renegotiable state — tear down and start fresh.
      this.teardownPeer(fromHex);
      this.pcm.addPeer(fromHex);
    }

    const freshPc = this.pcm.getPeer(fromHex)!;

    try {
      await freshPc.setRemoteDescription(new RTCSessionDescription(offer));
      this.remoteDescSet.add(fromHex);
      await this.flushPendingCandidates(fromHex, freshPc);

      // Guard: connection may have been replaced during the async gap.
      if (this.pcm.getPeer(fromHex) !== freshPc) return;
      if (freshPc.signalingState !== 'have-remote-offer') return;

      const answer = await freshPc.createAnswer();
      await freshPc.setLocalDescription(answer);

      const toIdentity = this.hexToIdentity(fromHex);
      if (!toIdentity || this.pcm.getPeer(fromHex) !== freshPc) return;

      this.db.reducers.sendAnswer({
        roomId: this.roomId,
        toIdentity,
        sdp: JSON.stringify(freshPc.localDescription),
      });
    } catch {
      // SDP error — tear down so the offerer's next retry starts clean.
      this.teardownPeer(fromHex);
    }
  }

  // ── Answer ─────────────────────────────────────────────────────────────────

  private async handleAnswer(fromHex: string, payload: string): Promise<void> {
    const answer: RTCSessionDescriptionInit = JSON.parse(payload);
    const pc = this.pcm.getPeer(fromHex);
    if (!pc) return;
    if (pc.signalingState !== 'have-local-offer') return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.remoteDescSet.add(fromHex);
      await this.flushPendingCandidates(fromHex, pc);
    } catch {
      // Stale answer — ignore.
    }
  }

  // ── ICE candidate ──────────────────────────────────────────────────────────

  private async handleIceCandidate(fromHex: string, payload: string): Promise<void> {
    const candidateInit: RTCIceCandidateInit = JSON.parse(payload);

    // Safari throws on addIceCandidate with empty candidate string.
    if (!candidateInit.candidate) return;

    const pc = this.pcm.getPeer(fromHex);

    if (!pc || !this.remoteDescSet.has(fromHex)) {
      const queue = this.pendingCandidates.get(fromHex) ?? [];
      queue.push(candidateInit);
      this.pendingCandidates.set(fromHex, queue);
      return;
    }

    if (pc.signalingState === 'closed') return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      // Stale candidate after a connection reset — ignore.
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private teardownPeer(identityHex: string): void {
    const t = this.restartTimers.get(identityHex);
    if (t) { clearTimeout(t); this.restartTimers.delete(identityHex); }
    const r = this.renegotiationTimers.get(identityHex);
    if (r) { clearTimeout(r); this.renegotiationTimers.delete(identityHex); }
    this.remoteDescSet.delete(identityHex);
    this.pendingCandidates.delete(identityHex);
    this.offerLocks.delete(identityHex);
    this.makingOffer.delete(identityHex);
    this.iceRestartAttempts.delete(identityHex);
    this.pcm.removePeer(identityHex);
  }

  private async flushPendingCandidates(fromHex: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(fromHex);
    if (!queue || queue.length === 0) return;
    this.pendingCandidates.delete(fromHex);
    for (const c of queue) {
      if (this.pcm.getPeer(fromHex) !== pc || pc.signalingState === 'closed') break;
      if (!c.candidate) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // Stale candidate — ignore.
      }
    }
  }

  /**
   * Replay cached signaling messages from a peer.
   * Called after addPeer() so the RTCPeerConnection exists before we process
   * the offer. Messages are processed sequentially so ICE candidates cannot
   * race ahead of the offer.
   */
  private replayForPeer(peerHex: string): void {
    const msgs: SignalingMessage[] = [];
    for (const msg of this.db.db.signaling_message.iter()) {
      if (
        msg.roomId === this.roomId &&
        msg.toIdentity.isEqual(this.myIdentity) &&
        msg.fromIdentity.toHexString() === peerHex
      ) {
        msgs.push(msg);
      }
    }
    msgs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Sequential processing: await each message so ICE candidates are not
    // added before setRemoteDescription completes.
    const process = async () => {
      for (const msg of msgs) {
        await this.handleIncomingMessage(null, msg);
      }
    };
    process().catch(() => {});
  }

  private sendIceCandidate(toIdentityHex: string, candidate: RTCIceCandidate): void {
    const toIdentity = this.hexToIdentity(toIdentityHex);
    if (!toIdentity) return;
    this.db.reducers.sendIceCandidate({
      roomId: this.roomId,
      toIdentity,
      candidateJson: JSON.stringify(candidate.toJSON()),
    });
  }

  private hexToIdentity(hex: string): Identity | null {
    for (const p of this.db.db.participant.iter()) {
      if (p.identity.toHexString() === hex) return p.identity;
    }
    for (const u of this.db.db.user.iter()) {
      if (u.identity.toHexString() === hex) return u.identity;
    }
    return null;
  }
}
