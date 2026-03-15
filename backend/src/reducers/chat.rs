use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::room_events::{RoomEvent, EventType, room_event};
use crate::tables::rate_limits::{ChatRateLimit, chat_rate_limit};
use crate::reducers::util::require_active_participant;

/// Rate limit: 1 message per second per identity.
const RATE_LIMIT_MICROS: u64 = 1_000_000;

#[reducer]
pub fn send_chat_message(ctx: &ReducerContext, room_id: u64, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    if message.len() > 4096 {
        return Err("Message too long (max 4096 characters)".to_string());
    }

    let sender = ctx.sender();

    // ── Rate limit ────────────────────────────────────────────────────────────
    let now_micros = ctx.timestamp
        .to_duration_since_unix_epoch()
        .unwrap_or_default()
        .as_micros() as u64;

    if let Some(entry) = ctx.db.chat_rate_limit().identity().find(sender) {
        let last_micros = entry.last_message_at
            .to_duration_since_unix_epoch()
            .unwrap_or_default()
            .as_micros() as u64;
        if now_micros.saturating_sub(last_micros) < RATE_LIMIT_MICROS {
            return Err("Sending too fast. Wait a moment before sending another message.".to_string());
        }
        ctx.db.chat_rate_limit().identity().update(ChatRateLimit {
            identity: sender,
            last_message_at: ctx.timestamp,
        });
    } else {
        ctx.db.chat_rate_limit().insert(ChatRateLimit {
            identity: sender,
            last_message_at: ctx.timestamp,
        });
    }

    let participant = require_active_participant(ctx, room_id)?;

    let display_name = participant.display_name.replace('\\', "\\\\").replace('"', "\\\"");
    let escaped_msg = message.replace('\\', "\\\\").replace('"', "\\\"");

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id,
        event_type: EventType::ChatMessage,
        payload: format!(r#"{{"message":"{}","display_name":"{}"}}"#, escaped_msg, display_name),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    Ok(())
}
