use spacetimedb::{Identity, SpacetimeType, Timestamp};

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum EventType {
    MeetingStarted,
    ParticipantJoined,
    ParticipantLeft,
    MediaToggled,
    MeetingEnded,
    ChatMessage,
    ReactionSent,
}

/// Append-only event log — never update or delete rows here.
#[spacetimedb::table(accessor = room_event, public, index(accessor = event_by_room, btree(columns = [room_id])))]
pub struct RoomEvent {
    #[primary_key]
    #[auto_inc]
    pub event_id: u64,
    pub room_id: u64,
    pub event_type: EventType,
    /// JSON-encoded event-specific payload
    pub payload: String,
    pub timestamp: Timestamp,
    pub identity: Identity,
}
