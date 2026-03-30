# Nexus — Future Scope

---

## 1. End-to-End Encryption (E2EE)

**Goal:** No server (including SpaceTimeDB) can read media or chat content.

### 1.1 — Insertable Streams API for media encryption
- Use the browser's [Insertable Streams / WebRTC Encoded Transform API](https://www.w3.org/TR/webrtc-encoded-transform/) to encrypt/decrypt RTP frames before they hit the network
- Generate a per-room AES-GCM symmetric key using `window.crypto.subtle.generateKey`
- Distribute the key via a Diffie-Hellman exchange over the signaling channel (ECDH key pairs per participant, never leave the browser)
- Each peer encrypts outbound frames; remote peers decrypt inbound frames
- Key ratcheting on participant join/leave (forward secrecy)

### 1.2 — E2EE for chat messages
- Encrypt `send_chat_message` payloads client-side using the same per-room AES-GCM key before calling the reducer
- SpaceTimeDB stores ciphertext only; decryption happens in the React client
- Add an `encrypted: boolean` field to the chat event payload for backwards compatibility

### 1.3 — Key verification UI
- "Security" panel in the meeting room showing each participant's key fingerprint
- Optional: QR-code-based out-of-band verification (like Signal's safety numbers)
- Visual indicator (lock icon + green border) when E2EE is active for a peer

### 1.4 — Backend changes
- New `encryption_keys` table: `room_id`, `identity`, `public_key_jwk` (ECDH public key), `created_at`
- New reducer `publish_public_key(ctx, room_id, public_key_jwk: String)` — called by each participant on join
- No private keys ever leave the browser

---

## 2. AI Features

### 2.1 — Live transcription and captions
- Use the browser [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) for on-device speech recognition (no data leaves browser)
- Or: stream audio to a server-side Whisper instance (OpenAI-compatible) for higher accuracy
- Display captions as overlays on each `VideoTile`
- Transcripts appended to `room_events` as `TranscriptionSegment` events (optional, off by default for privacy)
- Caption language selector in settings

### 2.2 — AI meeting summary
- After `end_meeting`, send the full `room_events` chat + transcription log to Claude API
- Generate: action items, key decisions, summary paragraph, participant talk-time stats
- Deliver summary via email or display in a post-meeting screen at `/summary/:roomCode`
- User controls: opt-in per meeting, choose summary detail level

### 2.3 — AI noise suppression
- Integrate [RNNoise](https://github.com/xiph/rnnoise) (WASM port) into the audio pipeline via Insertable Streams
- Apply noise suppression to the local mic track before it is sent to peers
- Toggle in the controls bar; no data leaves the browser

### 2.4 — AI background blur / virtual backgrounds
- Use [MediaPipe Selfie Segmentation](https://developers.google.com/mediapipe/solutions/vision/image_segmenter) in a Web Worker
- Render segmented output to a canvas, use `canvas.captureStream()` as the video track
- Presets: blur, solid color, custom image upload
- GPU-accelerated via WebGL; fallback to CPU for low-end devices

### 2.5 — Smart layout: active speaker detection
- Analyse audio levels from `RTCRtpReceiver.getSynchronizationSources()` to detect the active speaker
- Promote the active speaker's `VideoTile` to the largest slot in the grid automatically
- Configurable: "Auto" (default) or "Manual" pin

### 2.6 — AI chat assistant (in-meeting)
- Slash-command interface inside `ChatPanel`: `/summarize`, `/action-items`, `/translate [lang]`
- Calls Claude API server-side (proxied through a thin Rust/Axum endpoint to hide API key)
- Responses appear as a "Nexus Bot" message in the chat panel

---

## 3. Scalability — SFU / Media Server

**Context:** the current mesh P2P topology breaks down at ~5+ participants (each peer sends N−1 streams).

### 3.1 — Selective Forwarding Unit (SFU)
- Integrate [mediasoup](https://mediasoup.org/) (Node.js) or [ion-sfu](https://github.com/pion/ion-sfu) (Go) as a media relay
- Each participant publishes one uplink; the SFU fans out to all subscribers
- SpaceTimeDB continues to handle signaling, room state, and events; SFU handles media only
- Architecture:

```
Browser A ──upload──► SFU ──fanout──► Browser B
                       │
                       └──────────►  Browser C
```

### 3.2 — Simulcast
- Publish 3 quality layers (high/medium/low) per video track
- SFU selects the appropriate layer per subscriber based on their bandwidth
- Controlled via `RTCRtpSender.setParameters()` encoding layers

### 3.3 — Adaptive bitrate
- Monitor `RTCIceCandidatePair` stats (`availableOutgoingBitrate`, `packetsLost`) every 2s
- Dynamically adjust video resolution and frame rate via `applyConstraints()`
- Fallback to audio-only mode if bandwidth drops below threshold

---

## 4. Advanced Meeting Features

### 4.1 — Breakout rooms
- Host can split participants into sub-rooms; each sub-room is a full `Room` record with a generated code
- New `breakout_rooms` table: `parent_room_id`, `breakout_room_id`, `assigned_identities[]`
- "Return to main room" button re-joins the parent room
- Host can broadcast a message to all breakout rooms simultaneously

### 4.2 — Polls and Q&A
- Host creates a poll (question + options); participants vote
- Results displayed as a bar chart overlay in real time
- Q&A mode: participants submit questions; host/moderator approves and promotes to screen
- Both use `room_events` with `PollCreated`, `PollVote`, `QuestionSubmitted`, `QuestionPromoted` event types

### 4.3 — Collaborative whiteboard
- Embedded canvas using [tldraw](https://tldraw.dev/) or [Excalidraw](https://excalidraw.com/)
- Drawing ops synced via SpaceTimeDB `whiteboard_ops` table (CRDT-friendly append-only log)
- Shared by default; individual cursors labelled with participant name

### 4.4 — Recording
- Server-side recording via a headless Chrome instance (Puppeteer) joining as a bot participant
- Records composite video (all tiles + audio mix) using `MediaRecorder` API
- Upload to S3-compatible storage; post-meeting download link sent to host
- Participant consent notification banner shown when recording is active

### 4.5 — Waiting room and lobby controls
- Host can hold participants in a waiting room before admitting them
- New `ParticipantStatus` field: `Waiting | Admitted | Rejected`
- Host sees waiting room panel with Admit / Reject buttons
- Participants in waiting room see a "Please wait, the host will let you in" screen

### 4.6 — Hand raise and speaker queue
- "Raise hand" button adds participant to an ordered queue (`room_events: HandRaised`)
- Host sees the queue in a sidebar; can call on the next speaker
- Lowers automatically when the participant starts speaking

---

## 5. Authentication and Identity

### 5.1 — Named accounts (OAuth)
- Add Google / GitHub OAuth via a lightweight Rust/Axum auth proxy
- On login, associate OAuth sub with SpaceTimeDB `Identity`; store `email`, `avatar_url`, `name` in `users` table
- Persistent display name, profile picture shown in `VideoTile`

### 5.2 — Meeting scheduling
- Host can create a scheduled meeting with a title, description, start time, and invitee emails
- Calendar invite (`.ics`) generated and emailed via SendGrid / Resend
- Scheduled meetings listed on a `/dashboard` page (requires auth)

### 5.3 — Role-based permissions
- Roles: `Host`, `Co-host`, `Presenter`, `Attendee`
- Co-host can mute participants, admit from waiting room, end meeting
- Presenter can share screen; Attendees are view-only by default (host can promote)
- Enforced server-side in reducers via role checks

---

## 6. Observability and Analytics

### 6.1 — Meeting analytics dashboard
- Post-meeting: participant join/leave times, talk-time breakdown, chat message count
- Derived from `room_events` event log (already append-only — query-ready)
- Visualised on `/analytics/:roomCode` (host only)

### 6.2 — WebRTC diagnostics
- Real-time stats panel (toggled in settings): RTT, packet loss, jitter, bitrate per peer
- Data from `RTCPeerConnection.getStats()` polled every 5s
- Poor connection warning badge on `VideoTile` when packet loss > 5%

### 6.3 — Server-side metrics
- Expose SpaceTimeDB module metrics (active rooms, connected identities, reducer call rates) via a Prometheus-compatible `/metrics` endpoint
- Grafana dashboard template for self-hosters

---

## 7. Developer Experience

### 7.1 — Public API / webhooks
- REST API (Rust/Axum sidecar) exposing: create room, list participants, send chat message
- Webhook support: `POST` to a configured URL on `MeetingStarted`, `ParticipantJoined`, `MeetingEnded`
- Useful for CRM integrations, Slack bots, automated recording triggers

### 7.2 — Embeddable SDK
- `<NexusEmbed roomCode="abc-defg-hij" />` React component publishable as an npm package
- Renders a full meeting room in an iframe with a postMessage API for host controls
- Use case: embed meetings inside third-party SaaS products

### 7.3 — Mobile native apps
- React Native frontend sharing business logic with the web client via shared TypeScript modules
- iOS / Android: use `react-native-webrtc` for peer connections
- Push notifications for incoming meeting invites (APNs / FCM)

---

## Priority Tiers

| Tier | Features | Rationale |
|------|----------|-----------|
| **High** | E2EE (§1), AI noise suppression (§2.3), Active speaker (§2.5), Waiting room (§4.5) | Core trust and UX improvements |
| **Medium** | Live captions (§2.1), SFU (§3.1), Polls (§4.2), OAuth (§5.1) | Enables larger meetings and broader adoption |
| **Low** | AI summary (§2.2), Breakout rooms (§4.1), Whiteboard (§4.3), Recording (§4.4), Mobile apps (§7.3) | High complexity, niche demand at early scale |
