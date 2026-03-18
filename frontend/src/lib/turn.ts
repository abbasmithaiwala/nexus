/**
 * TURN credential provisioning via Metered.ca REST API.
 *
 * Fetches short-lived TURN credentials from Metered on demand.
 * Set VITE_METERED_API_KEY in your .env file.
 */

export interface TurnCredentials {
  iceServers: RTCIceServer[];
}

/**
 * Fetches ICE server credentials from Metered.ca.
 * Returns empty array if no API key is configured.
 */
export async function getTurnCredentials(): Promise<TurnCredentials> {
  const apiKey = import.meta.env.VITE_METERED_API_KEY as string | undefined;

  if (!apiKey) {
    return { iceServers: [] };
  }

  const response = await fetch(
    `https://nexusmeet.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
  );

  if (!response.ok) {
    console.warn('Failed to fetch TURN credentials from Metered:', response.status);
    return { iceServers: [] };
  }

  const iceServers: RTCIceServer[] = await response.json();
  return { iceServers };
}
