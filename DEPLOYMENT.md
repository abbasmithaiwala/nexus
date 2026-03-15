# Deployment Guide

## SpaceTimeDB Cloud (Maincloud)

### 1. Login

```bash
spacetime login
```

### 2. Publish the module

```bash
spacetime publish nexus --module-path backend
```

The module will be live at `wss://maincloud.spacetimedb.com` under the name `nexus`.

### 3. Configure the frontend

Set the following in `frontend/.env` (or your hosting platform's env vars):

```env
VITE_SPACETIMEDB_URL=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_MODULE=nexus
```

### 4. Build and deploy the frontend

```bash
cd frontend && npm run build
```

Deploy the `frontend/dist/` directory to any static host (Vercel, Netlify, Cloudflare Pages, etc.).

---

## TURN Server

WebRTC works peer-to-peer using STUN for most networks. However, users behind **symmetric NAT** (common in corporate/mobile networks) require a TURN relay. For production, set up a TURN server.

### Option A — Coturn (self-hosted)

1. Install coturn on a public VPS:

```bash
apt-get install coturn
```

2. Edit `/etc/turnserver.conf`:

```
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=YOUR_STRONG_SECRET
realm=turn.yourdomain.com
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
```

3. Start coturn:

```bash
systemctl enable coturn && systemctl start coturn
```

4. Set frontend env vars:

```env
VITE_TURN_URL=turn:turn.yourdomain.com:3478
VITE_TURN_USERNAME=nexus
VITE_TURN_CREDENTIAL=YOUR_STRONG_SECRET
```

For time-limited HMAC credentials (recommended for production), generate them server-side using the `static-auth-secret` and set the computed username/credential in `frontend/src/lib/turn.ts`.

### Option B — Twilio TURN (managed)

1. Create a [Twilio](https://www.twilio.com) account and get a Network Traversal Service token.
2. Use the Twilio REST API to generate ephemeral ICE server credentials.
3. Store them in your env vars or generate them at runtime via an edge function.

---

## Updating the Module

After changing the Rust backend:

```bash
# Republish (keeps existing data)
spacetime publish nexus --module-path backend

# Clear database and republish (destroys all data)
spacetime publish nexus --clear-database -y --module-path backend

# Regenerate frontend bindings after schema changes
make generate
```

---

## Monitoring

```bash
spacetime logs nexus          # Live logs
spacetime logs nexus -n 200   # Last 200 lines
```

The SpaceTimeDB dashboard for your module is at:
`https://spacetimedb.com/@<your-username>/nexus`
