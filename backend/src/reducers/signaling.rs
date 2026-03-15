use spacetimedb::{reducer, Table, ReducerContext, Identity};

use crate::tables::signaling::{SignalingMessage, SignalingMessageType, signaling_message};
use crate::reducers::util::require_active_participant;

#[reducer]
pub fn send_offer(ctx: &ReducerContext, room_id: u64, to_identity: Identity, sdp: String) -> Result<(), String> {
    require_active_participant(ctx, room_id)?;
    ctx.db.signaling_message().insert(SignalingMessage {
        id: 0,
        room_id,
        from_identity: ctx.sender(),
        to_identity,
        message_type: SignalingMessageType::Offer,
        payload: sdp,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn send_answer(ctx: &ReducerContext, room_id: u64, to_identity: Identity, sdp: String) -> Result<(), String> {
    require_active_participant(ctx, room_id)?;
    ctx.db.signaling_message().insert(SignalingMessage {
        id: 0,
        room_id,
        from_identity: ctx.sender(),
        to_identity,
        message_type: SignalingMessageType::Answer,
        payload: sdp,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn send_ice_candidate(ctx: &ReducerContext, room_id: u64, to_identity: Identity, candidate_json: String) -> Result<(), String> {
    require_active_participant(ctx, room_id)?;
    ctx.db.signaling_message().insert(SignalingMessage {
        id: 0,
        room_id,
        from_identity: ctx.sender(),
        to_identity,
        message_type: SignalingMessageType::IceCandidate,
        payload: candidate_json,
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Deletes all signaling rows for a room. Only active participants may call this.
#[reducer]
pub fn cleanup_signaling(ctx: &ReducerContext, room_id: u64) -> Result<(), String> {
    require_active_participant(ctx, room_id)?;
    let ids: Vec<u64> = ctx.db.signaling_message().signaling_by_room().filter(&room_id)
        .map(|msg| msg.id)
        .collect();
    for id in ids {
        ctx.db.signaling_message().id().delete(&id);
    }
    Ok(())
}
