/**
 * SignalingManager — Perfect Negotiation pattern for WebRTC over SpaceTimeDB.
 *
 * polite   = myHex < theirHex  (yields on glare, rolls back own offer)
 * impolite = myHex > theirHex  (keeps own offer on glare, discards incoming)
 *
 * Per-peer state (PeerState) is owned entirely here — no state leaks to PCM.
 *
 * Key behaviours:
 * - negotiate() is the single entry point for all offer creation. Three guards
 *   prevent invalid calls: makingOffer (re-entrancy), signalingState !== stable
 *   (mid-handshake), and suppressNextNegotiation (post-rollback spurious fire).
 * - handleAnswer always clears ignoreOffer before checking signalingState so
 *   the impolite side never accidentally drops the answer to its own offer.
 * - Empty ICE candidates (end-of-candidates signal) are skipped — Safari throws
 *   if addIceCandidate is called with candidate: ''.
 * - Both connectionstatechange and iceconnectionstatechange trigger ICE restart
 *   scheduling; Safari iOS only fires the latter reliably.
 */

import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@/module_bindings';
import type { SignalingMessage } from '@/module_bindings/types';
import type { PeerConnectionManager } from './webrtc';

interface PeerState {
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  restartTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Set when the polite side rolls back its offer to accept the remote's.
   * The rollback fires a spurious onnegotiationneeded once stable is reached;
   * this flag suppresses that single extra call.
   */
  suppressNextNegotiation: boolean;
}

export class SignalingManager {
  private db: DbConnection;
  private myIdentity: Identity;
  private myHex: string;
  private roomId: bigint;
  private pcm: PeerConnectionManager;

  private peers = new Map<string, PeerState>();

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

    this.pcm.onIceCandidate = (hex, candidate) => {
      this.sendSignal(hex, 'IceCandidate', JSON.stringify(candidate.toJSON()));
    };

    this.pcm.onNegotiationNeeded = (hex) => {
      this.negotiate(hex).catch(() => {});
    };

    this.pcm.onConnectionFailed = (hex) => {
      this.scheduleIceRestart(hex);
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────

  start(): void {
    this.db.db.signaling_message.onInsert(this.boundOnInsert);
  }

  stop(): void {
    this.db.db.signaling_message.removeOnInsert(this.boundOnInsert);
    for (const state of this.peers.values()) {
      if (state.restartTimer) clearTimeout(state.restartTimer);
    }
    this.peers.clear();
  }

  handleNewParticipant(identityHex: string): void {
    if (this.peers.has(identityHex)) return;

    this.peers.set(identityHex, {
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      remoteDescSet: false,
      restartTimer: null,
      suppressNextNegotiation: false,
    });

    // addPeer triggers onnegotiationneeded → negotiate() (Chrome: synchronously
    // via addTrack; Safari: asynchronously on next microtask).
    this.pcm.addPeer(identityHex);

    if (this.myHex <= identityHex) {
      // Polite side: replay any offer the remote sent before we subscribed.
      this.replayForPeer(identityHex);
    }
    // Impolite side: onnegotiationneeded from addTrack drives negotiate().
  }

  /** Called by useWebRTC when a participant leaves the room. */
  removePeer(identityHex: string): void {
    this.teardownPeer(identityHex);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Perfect Negotiation — offer creation
  // ──────────────────────────────────────────────────────────────────────

  private async negotiate(identityHex: string): Promise<void> {
    const state = this.peers.get(identityHex);
    const pc = this.pcm.getPeer(identityHex);
    if (!state || !pc) return;

    // Guard 1: already building an offer — skip re-entrant call.
    if (state.makingOffer) return;

    // Guard 2: mid-handshake — browser will re-fire once stable.
    if (pc.signalingState !== 'stable') return;

    // Guard 3: polite side just sent an answer after a rollback — suppress
    // the spurious onnegotiationneeded the rollback fires on return to stable.
    if (state.suppressNextNegotiation) {
      state.suppressNextNegotiation = false;
      return;
    }

    // Set makingOffer synchronously before the first await so concurrent
    // onnegotiationneeded events see it immediately.
    state.makingOffer = true;
    try {
      const offer = await pc.createOffer();
      // Re-check: handleOffer may have run during createOffer (async gap).
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      const toIdentity = this.hexToIdentity(identityHex);
      if (!toIdentity || this.pcm.getPeer(identityHex) !== pc) return;
      this.sendSignal(identityHex, 'Offer', JSON.stringify(pc.localDescription));
    } catch {
      // createOffer/setLocalDescription failed (connection closed, etc.) — ignore.
    } finally {
      state.makingOffer = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Incoming message dispatch
  // ──────────────────────────────────────────────────────────────────────

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

  // ── Offer ──────────────────────────────────────────────────────────────

  private async handleOffer(fromHex: string, payload: string): Promise<void> {
    // Lazily init if the offer arrived before handleNewParticipant.
    if (!this.peers.has(fromHex)) {
      this.peers.set(fromHex, {
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        remoteDescSet: false,
        restartTimer: null,
        suppressNextNegotiation: false,
      });
      this.pcm.addPeer(fromHex);
    }

    const state = this.peers.get(fromHex)!;
    const pc = this.pcm.getPeer(fromHex)!;
    const polite = this.isPolite(fromHex);

    const offerCollision =
      state.makingOffer ||
      (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer');

    // Impolite side: discard the incoming offer on collision.
    state.ignoreOffer = !polite && offerCollision;
    if (state.ignoreOffer) return;

    const offer: RTCSessionDescriptionInit = JSON.parse(payload);
    try {
      if (offerCollision && polite) {
        // Roll back our pending offer so we can accept the remote's.
        await pc.setLocalDescription({ type: 'rollback' });
        state.makingOffer = false;
        // Rollback fires onnegotiationneeded on return to stable — suppress it.
        state.suppressNextNegotiation = true;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      state.remoteDescSet = true;
      await this.flushPendingCandidates(fromHex, pc, state);

      if (this.pcm.getPeer(fromHex) !== pc) return;
      if (pc.signalingState !== 'have-remote-offer') return;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const toIdentity = this.hexToIdentity(fromHex);
      if (!toIdentity) return;
      this.sendSignal(fromHex, 'Answer', JSON.stringify(pc.localDescription));
    } catch {
      // SDP error — tear down so the offerer's next retry starts clean.
      this.teardownPeer(fromHex);
    }
  }

  // ── Answer ─────────────────────────────────────────────────────────────

  private async handleAnswer(fromHex: string, payload: string): Promise<void> {
    const state = this.peers.get(fromHex);
    const pc = this.pcm.getPeer(fromHex);
    if (!state || !pc) return;

    // ignoreOffer guards incoming *offers* on the impolite side; it must not
    // gate answers — those are responses to our own offer and are always valid.
    state.ignoreOffer = false;

    if (pc.signalingState !== 'have-local-offer') return;

    const answer: RTCSessionDescriptionInit = JSON.parse(payload);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      state.remoteDescSet = true;
      await this.flushPendingCandidates(fromHex, pc, state);
    } catch {
      // Stale answer — ignore.
    }
  }

  // ── ICE candidate ──────────────────────────────────────────────────────

  private async handleIceCandidate(fromHex: string, payload: string): Promise<void> {
    const candidateInit: RTCIceCandidateInit = JSON.parse(payload);

    // Safari throws on addIceCandidate with empty candidate string.
    if (!candidateInit.candidate) return;

    const state = this.peers.get(fromHex);
    const pc = this.pcm.getPeer(fromHex);

    if (!state || !pc || !state.remoteDescSet) {
      const s = state ?? this.ensurePeerState(fromHex);
      s.pendingCandidates.push(candidateInit);
      return;
    }

    if (pc.signalingState === 'closed') return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      // Stale candidate after a connection reset — ignore.
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // ICE restart
  // ──────────────────────────────────────────────────────────────────────

  private scheduleIceRestart(identityHex: string): void {
    const state = this.peers.get(identityHex);
    if (!state) return;
    if (state.restartTimer) clearTimeout(state.restartTimer);
    // Polite side restarts to avoid both sides restarting simultaneously.
    if (!this.isPolite(identityHex)) return;

    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      const pc = this.pcm.getPeer(identityHex);
      if (!pc) return;
      if (pc.signalingState !== 'stable' && pc.connectionState !== 'failed') return;
      this.sendIceRestartOffer(identityHex).catch(() => {});
    }, 2000);
  }

  private async sendIceRestartOffer(identityHex: string): Promise<void> {
    const state = this.peers.get(identityHex);
    const pc = this.pcm.getPeer(identityHex);
    if (!state || !pc) return;

    state.makingOffer = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      const toIdentity = this.hexToIdentity(identityHex);
      if (!toIdentity) return;
      this.sendSignal(identityHex, 'Offer', JSON.stringify(pc.localDescription));
    } catch {
      // Connection closed — ignore.
    } finally {
      state.makingOffer = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  private isPolite(identityHex: string): boolean {
    return this.myHex < identityHex;
  }

  private ensurePeerState(identityHex: string): PeerState {
    if (!this.peers.has(identityHex)) {
      this.peers.set(identityHex, {
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        remoteDescSet: false,
        restartTimer: null,
        suppressNextNegotiation: false,
      });
    }
    return this.peers.get(identityHex)!;
  }

  private teardownPeer(identityHex: string): void {
    const state = this.peers.get(identityHex);
    if (state?.restartTimer) clearTimeout(state.restartTimer);
    this.peers.delete(identityHex);
    this.pcm.removePeer(identityHex);
  }

  private async flushPendingCandidates(
    fromHex: string,
    pc: RTCPeerConnection,
    state: PeerState,
  ): Promise<void> {
    const queue = state.pendingCandidates.splice(0);
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
    for (const msg of msgs) {
      this.handleIncomingMessage(null, msg);
    }
  }

  private sendSignal(toHex: string, type: 'Offer' | 'Answer' | 'IceCandidate', payload: string): void {
    const toIdentity = this.hexToIdentity(toHex);
    if (!toIdentity) return;
    if (type === 'Offer') {
      this.db.reducers.sendOffer({ roomId: this.roomId, toIdentity, sdp: payload });
    } else if (type === 'Answer') {
      this.db.reducers.sendAnswer({ roomId: this.roomId, toIdentity, sdp: payload });
    } else {
      this.db.reducers.sendIceCandidate({ roomId: this.roomId, toIdentity, candidateJson: payload });
    }
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
