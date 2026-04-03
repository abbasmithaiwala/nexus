/**
 * TURN credential provisioning via a server-side edge function.
 *
 * The API key never leaves the server — the client only receives
 * short-lived ICE server credentials from /api/turn-credentials.
 */

export interface TurnCredentials {
  iceServers: RTCIceServer[];
}

export async function getTurnCredentials(): Promise<TurnCredentials> {
  try {
    const response = await fetch('/api/turn-credentials', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    if (!response.ok) {
      console.warn('Failed to fetch TURN credentials:', response.status);
      return { iceServers: [] };
    }

    const iceServers: RTCIceServer[] = await response.json();
    return { iceServers };
  } catch (err) {
    console.warn('TURN credentials fetch error:', err);
    return { iceServers: [] };
  }
}
