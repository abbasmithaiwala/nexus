# Nexus — Frontend

React + TypeScript + Vite frontend for the Nexus video conferencing app.

## Setup

```bash
npm install
cp .env.example .env   # then edit .env
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SPACETIMEDB_URL` | `wss://maincloud.spacetimedb.com` | SpaceTimeDB WebSocket URL |
| `VITE_SPACETIMEDB_MODULE` | `nexus` | SpaceTimeDB database/module name |
| `VITE_TURN_URL` | _(empty)_ | TURN server URL, e.g. `turn:turn.example.com:3478` |
| `VITE_TURN_USERNAME` | _(empty)_ | TURN username |
| `VITE_TURN_CREDENTIAL` | _(empty)_ | TURN credential |

If `VITE_TURN_URL` is not set the app runs in STUN-only mode (works for most networks, may fail behind symmetric NAT).

## Scripts

```bash
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview the production build locally
npm run lint     # Run ESLint
```

## Key Source Directories

| Path | Purpose |
|------|---------|
| `src/lib/` | SpaceTimeDB singleton, WebRTC manager, signaling, TURN credentials |
| `src/hooks/` | All data/media logic (no business logic in components) |
| `src/components/` | Reusable UI components (VideoTile, ControlsBar, Toast, …) |
| `src/pages/` | Route-level pages (Home, Lobby, Room) |
| `src/module_bindings/` | Auto-generated TypeScript bindings — **do not edit** |
| `src/contexts/` | SpaceTimeDB React context with reconnection logic |

## Regenerating Module Bindings

When the backend schema changes, regenerate bindings from the project root:

```bash
make generate
```

This overwrites `src/module_bindings/` with fresh types and reducer stubs.
