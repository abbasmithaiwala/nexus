export const config = {
  runtime: 'edge',
};

export default async function handler(): Promise<Response> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !apiToken) {
    return new Response(JSON.stringify({ error: 'TURN credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }), // 24-hour credentials (max 48h)
    }
  );

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch TURN credentials' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cloudflare returns: { iceServers: [ { urls, username, credential }, ... ] }
  const { iceServers } = await upstream.json();

  return new Response(JSON.stringify(iceServers), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
