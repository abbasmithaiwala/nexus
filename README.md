# Nexus — Live Video Conference App

A production-grade Video Conferencing / Meeting App built with React, Rust, and SpaceTimeDB.

## Architecture

```
Browser A ◄──── WebRTC Media (P2P direct) ────► Browser B
    │                                                 │
    └──── SpaceTimeDB Subscriptions (WebSocket) ──────┘
              (signaling, room state, chat, events)

SpaceTimeDB Module (Rust → WASM)
├── Tables: users, rooms, participants, signaling_messages, room_events, chat_rate_limits
└── Reducers: create_room, join_room, leave_room, send_offer/answer/ice, chat, reactions
```

## Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + react-router v7
- **Backend:** Rust SpaceTimeDB module (compiled to WASM)
- **Realtime/DB:** SpaceTimeDB (signaling + room state + events)
- **WebRTC:** Mesh P2P (pure browser APIs, no media server)
- **Auth:** SpaceTimeDB built-in cryptographic identity (display name only)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [Rust](https://rustup.rs) + `wasm32-unknown-unknown` target
- [SpaceTimeDB CLI](https://spacetimedb.com/install)

```bash
rustup target add wasm32-unknown-unknown
cargo install spacetimedb-cli
```

### 1. Start SpaceTimeDB locally

```bash
spacetime start
```

### 2. Publish the backend module

```bash
make publish
```

### 3. Generate TypeScript bindings

```bash
make generate
```

### 4. Start the frontend

```bash
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment Variables

Copy `frontend/.env.example` to `frontend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SPACETIMEDB_URL` | `wss://maincloud.spacetimedb.com` | SpaceTimeDB server URL |
| `VITE_SPACETIMEDB_MODULE` | `nexus` | Module/database name |
| `VITE_TURN_URL` | _(empty)_ | TURN server URL (optional) |
| `VITE_TURN_USERNAME` | _(empty)_ | TURN username |
| `VITE_TURN_CREDENTIAL` | _(empty)_ | TURN credential |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for TURN server setup.

## Features

- Create or join meetings with a shareable room code (`abc-defg-hij`)
- Camera and mic preview before joining (lobby)
- Responsive video grid (1 / 2 / 2×2 / dynamic 5+)
- Screen sharing with automatic layout adjustment
- In-meeting chat with relative timestamps
- Emoji reactions with floating animations on video tiles
- Host controls (end meeting, host transfer on leave)
- Mobile-responsive UI (375px / 390px / 768px tested)
- Exponential backoff reconnection to SpaceTimeDB
- Toast notifications for connection and permission errors
- Server-side rate limiting (1 chat message/sec per identity)

## Project Structure

```
video-conference-app/
├── backend/          # Rust SpaceTimeDB WASM module
│   ├── src/
│   │   ├── tables/   # DB table definitions
│   │   └── reducers/ # Transactional mutations
│   └── docs/         # Rust/SpaceTimeDB learning series
├── frontend/         # React + TypeScript + Vite
│   └── src/
│       ├── lib/      # SpaceTimeDB client, WebRTC, TURN, signaling
│       ├── hooks/    # All data and media logic
│       ├── components/
│       └── pages/
├── Makefile          # SpaceTimeDB dev commands
├── DEPLOYMENT.md     # Production deployment guide
└── README.md
```

## Development Commands

```bash
make start      # Start local SpaceTimeDB server
make publish    # Publish backend module to local SpaceTimeDB
make generate   # Regenerate TypeScript bindings from backend schema
make logs       # Tail SpaceTimeDB server logs
```
