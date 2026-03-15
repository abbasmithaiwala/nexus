# Nexus - Live Video Conference App

A production-grade Video Conferencing / Meeting App built with React, Rust, and SpaceTimeDB.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + react-router v7
- **Backend:** Rust SpaceTimeDB module (compiled to WASM)
- **Realtime/DB:** SpaceTimeDB (signaling + room state + events)
- **WebRTC:** Mesh P2P (pure browser APIs)
- **Auth:** SpaceTimeDB built-in cryptographic identity

## Architecture

```
Browser A ◄──── WebRTC Media (P2P direct) ────► Browser B
    │                                                 │
    └──── SpaceTimeDB Subscriptions (WebSocket) ───────┘
              (signaling, room state, chat, events)

SpaceTimeDB Module (Rust → WASM)
├── Tables: users, rooms, participants, signaling_messages, room_events
└── Reducers: create_room, join_room, leave_room, send_offer/answer/ice, chat, reactions
```

