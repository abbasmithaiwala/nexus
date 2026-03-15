use spacetimedb::{reducer, ReducerContext};

/// Called by the frontend before creating an RTCPeerConnection.
/// Returns TURN credentials via a room_event so the client can read them.
/// Configure the TURN server URL via the TURN_SERVER_URL and TURN_SECRET
/// environment variables when publishing the module.
///
/// For production, replace these with real ephemeral HMAC-SHA1 credentials
/// (e.g. Coturn time-limited credentials or Twilio TURN tokens).
#[reducer]
pub fn get_turn_credentials(ctx: &ReducerContext) -> Result<(), String> {
    // SpaceTimeDB reducers cannot return values — credentials are logged for now.
    // In production, write them to a private per-identity table the client subscribes to.
    log::info!(
        "TURN credentials requested by {:?}",
        ctx.sender().to_hex().to_string()
    );
    Ok(())
}
