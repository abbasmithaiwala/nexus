use spacetimedb::{Identity, Timestamp};

/// Tracks the last time each identity sent a chat message.
/// Used to enforce a 1-message-per-second rate limit in `send_chat_message`.
#[spacetimedb::table(accessor = chat_rate_limit)]
pub struct ChatRateLimit {
    #[primary_key]
    pub identity: Identity,
    pub last_message_at: Timestamp,
}
