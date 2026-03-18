export const config = {
  runtime: 'edge',
};

export default async function handler(): Promise<Response> {
  const apiKey = process.env.METERED_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'TURN credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(
    `https://nexusmeet.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
  );

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch TURN credentials' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const iceServers = await upstream.json();

  return new Response(JSON.stringify(iceServers), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
