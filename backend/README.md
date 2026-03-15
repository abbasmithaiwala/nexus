# Nexus — Backend

Rust SpaceTimeDB module that compiles to WASM. Handles all server-side logic: room state, signaling, chat, reactions, and security.

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target
- SpaceTimeDB CLI

```bash
rustup target add wasm32-unknown-unknown
cargo install spacetimedb-cli
```

## Development

```bash
# From the project root:
make start      # Start local SpaceTimeDB instance
make publish    # Compile + publish module to local instance
make generate   # Regenerate frontend TypeScript bindings
make logs       # Tail live server logs
```

## Module Structure

```
src/
├── lib.rs              # Entry point: init / client_connected / client_disconnected hooks
├── tables/
│   ├── users.rs        # User identities and display names
│   ├── rooms.rs        # Rooms with status (Active / Ended)
│   ├── participants.rs # Room participants + media state
│   ├── signaling.rs    # WebRTC SDP / ICE messages
│   ├── room_events.rs  # Append-only event log (chat, reactions, media changes)
│   └── rate_limits.rs  # Per-identity chat rate limiting
└── reducers/
    ├── rooms.rs        # create_room, join_room, leave_room, end_meeting
    ├── signaling.rs    # send_offer, send_answer, send_ice_candidate, cleanup_signaling
    ├── media.rs        # update_media_state
    ├── chat.rs         # send_chat_message (with 1 msg/sec rate limit)
    ├── reactions.rs    # send_reaction (emoji allowlist enforced)
    ├── turn.rs         # get_turn_credentials (stub — extend for production)
    └── util.rs         # Shared helpers: require_active_participant, sanitize_display_name
```

## Security

- **Display name sanitization:** control characters stripped, max 50 chars, enforced in `sanitize_display_name()` called by `create_room` and `join_room`.
- **Chat rate limiting:** max 1 message per second per identity, enforced server-side via `chat_rate_limits` table.
- **Reaction allowlist:** only `👍 ❤️ 😂 😮 👏 🎉` accepted; others rejected with an error.
- **Message length limit:** chat messages capped at 4096 characters.
- **Room code validation:** `join_room` rejects codes longer than 20 characters.
- **Host-only actions:** `end_meeting` verifies the caller is the room host.
