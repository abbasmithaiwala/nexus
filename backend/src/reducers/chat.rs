use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::room_events::{RoomEvent, EventType, room_event};
use crate::reducers::util::require_active_participant;

#[reducer]
pub fn send_chat_message(ctx: &ReducerContext, room_id: u64, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    if message.len() > 4096 {
        return Err("Message too long (max 4096 characters)".to_string());
    }

    let participant = require_active_participant(ctx, room_id)?;
    let sender = ctx.sender();

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
