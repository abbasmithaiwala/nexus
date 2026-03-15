use spacetimedb::{ReducerContext, Identity};

use crate::tables::participants::{Participant, participant};

/// Returns the caller's active participant row for `room_id`, or an error.
/// "Active" means `left_at` is None — i.e. the participant has not left.
pub fn require_active_participant(
    ctx: &ReducerContext,
    room_id: u64,
) -> Result<Participant, String> {
    require_active_participant_for(ctx, ctx.sender(), room_id)
}

/// Same as above but checks a specific identity (useful when the caller acts on behalf of another identity, e.g. host transfers).
pub fn require_active_participant_for(
    ctx: &ReducerContext,
    identity: Identity,
    room_id: u64,
) -> Result<Participant, String> {
    ctx.db
        .participant()
        .participant_by_room()
        .filter(&room_id)
        .find(|p| p.identity == identity && p.left_at.is_none())
        .ok_or_else(|| "You are not an active participant in this room".to_string())
}
