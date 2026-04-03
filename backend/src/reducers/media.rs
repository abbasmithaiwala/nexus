use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::{
    participants::{Participant, MediaState, PresenceStatus, participant},
    room_events::{RoomEvent, EventType, room_event},
};
use crate::reducers::util::require_active_participant;

/// Maps an integer status code sent from the client to a PresenceStatus variant.
/// 0 = Unknown, 1 = Active, 2 = Away, 3 = Drowsy
fn presence_status_from_u8(code: u8) -> Result<PresenceStatus, String> {
    match code {
        0 => Ok(PresenceStatus::Unknown),
        1 => Ok(PresenceStatus::Active),
        2 => Ok(PresenceStatus::Away),
        3 => Ok(PresenceStatus::Drowsy),
        _ => Err(format!("Invalid presence status code: {}", code)),
    }
}

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
            // Preserve existing presence_status — it is updated by a separate reducer.
            presence_status: participant.media_state.presence_status.clone(),
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

/// Called by each client to report their own presence status detected locally.
/// Uses a u8 code (0–3) to avoid SpacetimeDB enum serialization complexity on the
/// client side: 0=Unknown, 1=Active, 2=Away, 3=Drowsy.
#[reducer]
pub fn update_presence_status(
    ctx: &ReducerContext,
    room_id: u64,
    status_code: u8,
) -> Result<(), String> {
    let participant = require_active_participant(ctx, room_id)?;
    let new_status = presence_status_from_u8(status_code)?;

    // Skip write if status hasn't changed — avoids unnecessary DB churn.
    if participant.media_state.presence_status == new_status {
        return Ok(());
    }

    ctx.db.participant().participant_id().update(Participant {
        media_state: MediaState {
            presence_status: new_status,
            ..participant.media_state.clone()
        },
        ..participant
    });

    Ok(())
}
