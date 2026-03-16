use spacetimedb::{reducer, Table, ReducerContext};

use crate::tables::{
    users::{User, user},
    rooms::{Room, RoomStatus, room},
    participants::{Participant, MediaState, participant},
    room_events::{RoomEvent, EventType, room_event},
    signaling::signaling_message,
};
use crate::reducers::util::sanitize_display_name;

/// Delete all signaling rows involving a specific identity in a room.
fn cleanup_signaling_for_identity(ctx: &ReducerContext, room_id: u64, identity: spacetimedb::Identity) {
    let ids: Vec<u64> = ctx.db.signaling_message().signaling_by_room().filter(&room_id)
        .filter(|msg| msg.from_identity == identity || msg.to_identity == identity)
        .map(|msg| msg.id)
        .collect();
    for id in ids {
        ctx.db.signaling_message().id().delete(&id);
    }
}

fn random_chars(ctx: &ReducerContext, n: usize) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    (0..n)
        .map(|_| {
            let idx = ctx.random::<u32>() as usize % CHARS.len();
            CHARS[idx] as char
        })
        .collect()
}

fn generate_room_code(ctx: &ReducerContext) -> String {
    format!("{}-{}-{}", random_chars(ctx, 3), random_chars(ctx, 4), random_chars(ctx, 3))
}

fn upsert_user(ctx: &ReducerContext, display_name: String) {
    let sender = ctx.sender();
    if let Some(existing) = ctx.db.user().identity().find(sender) {
        ctx.db.user().identity().update(User {
            display_name,
            ..existing
        });
    } else {
        ctx.db.user().insert(User {
            identity: sender,
            display_name,
            created_at: ctx.timestamp,
        });
    }
}

#[reducer]
pub fn create_room(ctx: &ReducerContext, display_name: String) -> Result<(), String> {
    let display_name = sanitize_display_name(&display_name);
    if display_name.is_empty() {
        return Err("Display name cannot be empty".to_string());
    }

    upsert_user(ctx, display_name.clone());

    // Generate a unique room code
    let room_code = loop {
        let code = generate_room_code(ctx);
        if ctx.db.room().room_code().find(&code).is_none() {
            break code;
        }
    };

    let sender = ctx.sender();
    let room = ctx.db.room().insert(Room {
        room_id: 0,
        room_code: room_code.clone(),
        title: format!("{}'s Meeting", display_name),
        host_identity: sender,
        status: RoomStatus::Active,
        created_at: ctx.timestamp,
        ended_at: None,
    });

    ctx.db.participant().insert(Participant {
        participant_id: 0,
        room_id: room.room_id,
        identity: sender,
        display_name: display_name.clone(),
        joined_at: ctx.timestamp,
        left_at: None,
        is_host: true,
        media_state: MediaState {
            audio_enabled: true,
            video_enabled: true,
            is_screen_sharing: false,
        },
    });

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id: room.room_id,
        event_type: EventType::MeetingStarted,
        payload: format!(r#"{{"room_code":"{}","host":"{}"}}"#, room_code, display_name),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    log::info!("Room created: {} by {}", room_code, display_name);
    Ok(())
}

#[reducer]
pub fn join_room(ctx: &ReducerContext, room_code: String, display_name: String) -> Result<(), String> {
    let display_name = sanitize_display_name(&display_name);
    if display_name.is_empty() {
        return Err("Display name cannot be empty".to_string());
    }
    if room_code.len() > 20 {
        return Err("Invalid room code".to_string());
    }

    let room = ctx.db.room().room_code().find(&room_code)
        .ok_or_else(|| format!("Room '{}' not found", room_code))?;

    if room.status == RoomStatus::Ended {
        return Err("This meeting has already ended".to_string());
    }

    let sender = ctx.sender();

    // Check if already an active participant
    let already_in = ctx.db.participant().participant_by_room().filter(&room.room_id)
        .any(|p| p.identity == sender && p.left_at.is_none());
    if already_in {
        return Err("Already in this room".to_string());
    }

    upsert_user(ctx, display_name.clone());

    // Clear any stale signaling rows from a previous session for this identity.
    cleanup_signaling_for_identity(ctx, room.room_id, sender);

    ctx.db.participant().insert(Participant {
        participant_id: 0,
        room_id: room.room_id,
        identity: sender,
        display_name: display_name.clone(),
        joined_at: ctx.timestamp,
        left_at: None,
        is_host: false,
        media_state: MediaState {
            audio_enabled: true,
            video_enabled: true,
            is_screen_sharing: false,
        },
    });

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id: room.room_id,
        event_type: EventType::ParticipantJoined,
        payload: format!(r#"{{"display_name":"{}"}}"#, display_name),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    Ok(())
}

#[reducer]
pub fn leave_room(ctx: &ReducerContext, room_id: u64) -> Result<(), String> {
    let sender = ctx.sender();
    let participant = ctx.db.participant().participant_by_room().filter(&room_id)
        .find(|p| p.identity == sender && p.left_at.is_none())
        .ok_or("You are not an active participant in this room")?;

    let was_host = participant.is_host;
    let display_name = participant.display_name.clone();

    ctx.db.participant().participant_id().update(Participant {
        left_at: Some(ctx.timestamp),
        ..participant
    });

    // Clean up signaling rows for the leaving participant.
    cleanup_signaling_for_identity(ctx, room_id, sender);

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id,
        event_type: EventType::ParticipantLeft,
        payload: format!(r#"{{"display_name":"{}"}}"#, display_name),
        timestamp: ctx.timestamp,
        identity: sender,
    });

    // Find remaining active participants
    let remaining: Vec<Participant> = ctx.db.participant().participant_by_room().filter(&room_id)
        .filter(|p| p.identity != sender && p.left_at.is_none())
        .collect();

    if remaining.is_empty() {
        end_meeting_internal(ctx, room_id)?;
    } else if was_host {
        let next_host = remaining.into_iter().next().unwrap();
        ctx.db.participant().participant_id().update(Participant {
            is_host: true,
            ..next_host
        });
    }

    Ok(())
}

#[reducer]
pub fn end_meeting(ctx: &ReducerContext, room_id: u64) -> Result<(), String> {
    let sender = ctx.sender();
    let participant = ctx.db.participant().participant_by_room().filter(&room_id)
        .find(|p| p.identity == sender && p.left_at.is_none())
        .ok_or("You are not an active participant in this room")?;

    if !participant.is_host {
        return Err("Only the host can end the meeting".to_string());
    }

    end_meeting_internal(ctx, room_id)
}

fn end_meeting_internal(ctx: &ReducerContext, room_id: u64) -> Result<(), String> {
    let room = ctx.db.room().room_id().find(&room_id)
        .ok_or("Room not found")?;

    if room.status == RoomStatus::Ended {
        return Ok(());
    }

    ctx.db.room().room_id().update(Room {
        status: RoomStatus::Ended,
        ended_at: Some(ctx.timestamp),
        ..room
    });

    ctx.db.room_event().insert(RoomEvent {
        event_id: 0,
        room_id,
        event_type: EventType::MeetingEnded,
        payload: "{}".to_string(),
        timestamp: ctx.timestamp,
        identity: ctx.sender(),
    });

    Ok(())
}
