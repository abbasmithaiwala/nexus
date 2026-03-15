/**
 * TURN credential provisioning.
 *
 * Reads TURN server configuration from environment variables.
 * If no TURN server is configured, returns an empty array (STUN-only mode).
 *
 * In production, set:
 *   VITE_TURN_URL      — e.g. turn:turn.example.com:3478
 *   VITE_TURN_USERNAME — static username (or generated via HMAC)
 *   VITE_TURN_CREDENTIAL — static credential (or generated via HMAC)
 *
 * For ephemeral credentials (Coturn or Twilio), generate them server-side
 * (e.g. via a backend procedure or edge function) and pass them here at
 * runtime.  See DEPLOYMENT.md for setup instructions.
 */

export interface TurnCredentials {
  iceServers: RTCIceServer[];
}

/**
 * Returns ICE server configuration including any configured TURN servers.
 * Falls back to empty array if no TURN env vars are set.
 */
export function getTurnCredentials(): TurnCredentials {
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (!turnUrl) {
    return { iceServers: [] };
  }

  const server: RTCIceServer = { urls: turnUrl };
  if (turnUsername) server.username = turnUsername;
  if (turnCredential) server.credential = turnCredential;

  return { iceServers: [server] };
}
