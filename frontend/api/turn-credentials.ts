import { kv } from '@vercel/kv';

export const config = {
  runtime: 'edge',
};

// ── Rate-limit constants ────────────────────────────────────────────────────
// A real user joins a room once; they never need more than a handful of
// credentials in a short window.  These limits are intentionally generous
// for legitimate use while making credential-flooding attacks uneconomical.

/** Max credential requests per IP within the per-IP window. */
const IP_LIMIT = 15;
/** Window length for the per-IP counter, in seconds. */
const IP_WINDOW_SEC = 600; // 10 minutes

/** If this many requests arrive globally within one minute, open the breaker. */
const GLOBAL_LIMIT = 200;
/** Circuit-breaker lockout duration once the global limit is tripped, in seconds. */
const BREAKER_TTL_SEC = 300; // 5-minute cooldown

// ── KV keys ────────────────────────────────────────────────────────────────
const globalCounterKey = 'turn:global:count';
const breakerKey = 'turn:breaker:open';

function ipKey(ip: string): string {
  return `turn:ip:${ip}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tooManyRequests(reason: string): Response {
  return json({ error: reason }, 429);
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  // ── Layer 1: Minimal browser-origin check ────────────────────────────────
  // Blocks naive scripts/curl that omit this header.  Not a hard security
  // boundary on its own, but cheap and eliminates unsophisticated bots.
  if (req.headers.get('X-Requested-With') !== 'XMLHttpRequest') {
    return tooManyRequests('Invalid request');
  }

  // ── Layer 2: Circuit breaker (global flood detection) ────────────────────
  // If a previous request already tripped the breaker, reject immediately.
  const breakerOpen = await kv.exists(breakerKey);
  if (breakerOpen) {
    return tooManyRequests('Service temporarily unavailable');
  }

  // Increment the rolling global counter (1-minute window).
  const globalCount = await kv.incr(globalCounterKey);
  if (globalCount === 1) {
    // First increment — set the 60-second expiry.
    await kv.expire(globalCounterKey, 60);
  }
  if (globalCount > GLOBAL_LIMIT) {
    // Trip the circuit breaker so all subsequent requests fail fast.
    await kv.set(breakerKey, 1, { ex: BREAKER_TTL_SEC });
    return tooManyRequests('Service temporarily unavailable');
  }

  // ── Layer 3: Per-IP rate limit ────────────────────────────────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const key = ipKey(ip);
  const ipCount = await kv.incr(key);
  if (ipCount === 1) {
    await kv.expire(key, IP_WINDOW_SEC);
  }
  if (ipCount > IP_LIMIT) {
    return tooManyRequests('Rate limit exceeded');
  }

  // ── Cloudflare TURN credential generation ────────────────────────────────
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !apiToken) {
    return json({ error: 'TURN credentials not configured' }, 500);
  }

  const upstream = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }),
    }
  );

  if (!upstream.ok) {
    return json({ error: 'Failed to fetch TURN credentials' }, 502);
  }

  const { iceServers } = await upstream.json();

  return new Response(JSON.stringify(iceServers), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
