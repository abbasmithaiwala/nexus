/**
 * SignalingManager — drives WebRTC offer/answer/ICE exchange via SpaceTimeDB.
 *
 * Architecture:
 *  - SpaceTimeDB's `signaling_message` table acts as the signaling channel.
 *  - Each client subscribes to rows where `toIdentity == myIdentity`.
 *  - When a new participant joins, exactly one side sends the offer, determined
 *    by lexicographic comparison of the two hex identity strings.
 *    (myIdentity > theirIdentity → I am the offerer)
 *    This prevents both sides creating an offer simultaneously.
 *
 * Usage:
 *  1. Construct with db, myIdentity, roomId, and a PeerConnectionManager.
 *  2. Call start() to register table listeners.
 *  3. Call handleNewParticipant(identityHex) when a remote participant joins.
 *  4. Call stop() on cleanup.
 */

import type { Identity } from 'spacetimedb';
import type { DbConnection } from '@/module_bindings';
import type { SignalingMessage } from '@/module_bindings/types';
import type { PeerConnectionManager } from './webrtc';

export class SignalingManager {
  private db: DbConnection;
  private myIdentity: Identity;
  private roomId: bigint;
  private pcm: PeerConnectionManager;

  /** Queued ICE candidates that arrived before the remote description was set */
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  /** Track which peer descriptions are ready to receive ICE candidates */
  private remoteDescSet = new Set<string>();

  private boundOnInsert: (ctx: unknown, row: SignalingMessage) => void;

  constructor(
    db: DbConnection,
    myIdentity: Identity,
    roomId: bigint,
    pcm: PeerConnectionManager,
  ) {
    this.db = db;
    this.myIdentity = myIdentity;
    this.roomId = roomId;
    this.pcm = pcm;

    // Bind once so we can unregister the exact same function reference.
    this.boundOnInsert = this.handleIncomingMessage.bind(this);

    // Wire ICE candidate callback back to the signaling layer.
    this.pcm.onIceCandidate = (identityHex, candidate) => {
      this.sendIceCandidate(identityHex, candidate);
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  start(): void {
    this.db.db.signaling_message.onInsert(this.boundOnInsert);
    // Replay is deferred to replayForPeer(), called after handleNewParticipant
    // so the peer connection exists before we process cached offers/answers.
  }

  /**
   * Replay any cached signaling messages from a specific peer.
   * Must be called AFTER handleNewParticipant() so the RTCPeerConnection exists.
   */
  replayForPeer(peerHex: string): void {
    for (const msg of this.db.db.signaling_message.iter()) {
      if (
        msg.roomId === this.roomId &&
        msg.toIdentity.isEqual(this.myIdentity) &&
        msg.fromIdentity.toHexString() === peerHex
      ) {
        this.handleIncomingMessage(null, msg);
      }
    }
  }

  stop(): void {
    this.db.db.signaling_message.removeOnInsert(this.boundOnInsert);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Participant join — decide who sends the offer
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called by the Room page when a new remote participant joins.
   * If our identity hex is greater than theirs, we are the offerer.
   */
  async handleNewParticipant(identityHex: string): Promise<void> {
    const myHex = this.myIdentity.toHexString();
    if (myHex > identityHex) {
      await this.sendOffer(identityHex);
    } else {
      // We are the answerer — replay any cached offer that arrived before we subscribed.
      this.replayForPeer(identityHex);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Incoming signaling message handler
  // ──────────────────────────────────────────────────────────────────────────

  private async handleIncomingMessage(_ctx: unknown, msg: SignalingMessage): Promise<void> {
    // Only process messages addressed to us in the current room.
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

  // ──────────────────────────────────────────────────────────────────────────
  // Offer / Answer handling
  // ──────────────────────────────────────────────────────────────────────────

  private async sendOffer(toIdentityHex: string): Promise<void> {
    const pc = this.pcm.addPeer(toIdentityHex);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const toIdentity = this.hexToIdentity(toIdentityHex);
    if (!toIdentity) return;

    this.db.reducers.sendOffer({
      roomId: this.roomId,
      toIdentity,
      sdp: JSON.stringify(offer),
    });
  }

  private async handleOffer(fromHex: string, payload: string): Promise<void> {
    const offer: RTCSessionDescriptionInit = JSON.parse(payload);
    const pc = this.pcm.addPeer(fromHex);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescSet.add(fromHex);
    await this.flushPendingCandidates(fromHex, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const toIdentity = this.hexToIdentity(fromHex);
    if (!toIdentity) return;

    this.db.reducers.sendAnswer({
      roomId: this.roomId,
      toIdentity,
      sdp: JSON.stringify(answer),
    });
  }

  private async handleAnswer(fromHex: string, payload: string): Promise<void> {
    const answer: RTCSessionDescriptionInit = JSON.parse(payload);
    const pc = this.pcm.getPeer(fromHex);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescSet.add(fromHex);
    await this.flushPendingCandidates(fromHex, pc);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ICE candidate handling
  // ──────────────────────────────────────────────────────────────────────────

  private async handleIceCandidate(fromHex: string, payload: string): Promise<void> {
    const candidateInit: RTCIceCandidateInit = JSON.parse(payload);
    const pc = this.pcm.getPeer(fromHex);

    if (!pc || !this.remoteDescSet.has(fromHex)) {
      // Queue until remote description is ready.
      const queue = this.pendingCandidates.get(fromHex) ?? [];
      queue.push(candidateInit);
      this.pendingCandidates.set(fromHex, queue);
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
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

  private async flushPendingCandidates(fromHex: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(fromHex);
    if (!queue || queue.length === 0) return;
    this.pendingCandidates.delete(fromHex);
    for (const c of queue) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Reconstruct an Identity from a hex string by looking it up in the local
   * participant / user table cache. Returns null if not found.
   */
  private hexToIdentity(hex: string): Identity | null {
    // Walk the local participant cache to find a matching Identity object.
    for (const p of this.db.db.participant.iter()) {
      if (p.identity.toHexString() === hex) return p.identity;
    }
    for (const u of this.db.db.user.iter()) {
      if (u.identity.toHexString() === hex) return u.identity;
    }
    return null;
  }
}
