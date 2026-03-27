export const config = {
  runtime: 'edge',
};

interface MeteredIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

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

  const iceServers: MeteredIceServer[] = await upstream.json();

  // Ensure we always have UDP, TCP, and TLS (turns://) entries.
  // Many corporate firewalls and mobile carriers block UDP and non-443 TCP,
  // so the turns:// entry on port 443 is the last-resort path that always works.
  const ensuredServers = ensureAllTransports(iceServers);

  return new Response(JSON.stringify(ensuredServers), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * For every TURN host returned by Metered, synthesise missing transport variants
 * (UDP, TCP, TLS on port 443) so that clients behind restrictive firewalls always
 * have a working relay path.
 */
function ensureAllTransports(servers: MeteredIceServer[]): MeteredIceServer[] {
  const result: MeteredIceServer[] = [];
  const addedUrls = new Set<string>();

  for (const server of servers) {
    result.push(server);
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const url of urls) {
      if (addedUrls.has(url)) continue;
      addedUrls.add(url);

      if (!url.startsWith('turn:') && !url.startsWith('turns:')) continue;

      // Extract host (strip protocol, path, and existing transport param)
      const withoutProto = url.replace(/^turns?:/, '');
      const host = withoutProto.split('?')[0];

      const variants: string[] = [
        `turn:${host}?transport=udp`,
        `turn:${host}?transport=tcp`,
        `turns:${host.replace(/:\d+$/, '')}:443?transport=tcp`, // TLS on 443 — bypasses firewalls
      ];

      for (const variant of variants) {
        if (!addedUrls.has(variant)) {
          addedUrls.add(variant);
          result.push({ urls: variant, username: server.username, credential: server.credential });
        }
      }
    }
  }

  return result;
}
