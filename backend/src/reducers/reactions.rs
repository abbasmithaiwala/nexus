use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::room_events::{RoomEvent, EventType, room_event};
use crate::reducers::util::require_active_participant;

const ALLOWED_EMOJIS: &[&str] = &["👍", "❤️", "😂", "😮", "👏", "🎉"];

#[reducer]
pub fn send_reaction(ctx: &ReducerContext, room_id: u64, emoji: String) -> Result<(), String> {
    if !ALLOWED_EMOJIS.contains(&emoji.as_str()) {
        return Err(format!("Invalid emoji. Allowed: {}", ALLOWED_EMOJIS.join(", ")));
    }

    let participant = require_active_participant(ctx, room_id)?;
    let sender = ctx.sender();

    let display_name = participant.display_name.replace('\\', "\\\\").replace('"', "\\\"");

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id,
        event_type: EventType::ReactionSent,
        payload: format!(r#"{{"emoji":"{}","display_name":"{}"}}"#, emoji, display_name),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    Ok(())
}
