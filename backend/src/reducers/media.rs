use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::{
    participants::{Participant, MediaState, participant},
    room_events::{RoomEvent, EventType, room_event},
};
use crate::reducers::util::require_active_participant;

#[reducer]
pub fn update_media_state(
    ctx: &ReducerContext,
    room_id: u64,
    audio_enabled: bool,
    video_enabled: bool,
    is_screen_sharing: bool,
) -> Result<(), String> {
    let participant = require_active_participant(ctx, room_id)?;
    let sender = ctx.sender();

    ctx.db.participant().participant_id().update(Participant {
        media_state: MediaState {
            audio_enabled,
            video_enabled,
            is_screen_sharing,
        },
        ..participant
    });

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id,
        event_type: EventType::MediaToggled,
        payload: format!(
            r#"{{"audio":{},"video":{},"screen":{}}}"#,
            audio_enabled, video_enabled, is_screen_sharing
        ),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    Ok(())
}
